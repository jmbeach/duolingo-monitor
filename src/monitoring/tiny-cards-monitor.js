import { create } from './models/context'
import Sequelize from 'sequelize';
import { join } from 'path';
import nodemailer from 'nodemailer';
import TinyCardsScraper from '../scraping/tiny-cards-scraper';
import winston from 'winston';
import Nightmare from 'nightmare';

export default class TinyCardsMonitor {
  /**
   * @param opts {{logger: winston.Logger}}
   * @param nightmareFactory {() => Nightmare}
   * */
  constructor(nightmareFactory, opts) {
    this._expiredDate = '1997-01-01'
    this._completedProgress = '100.00%'
    this._nightmare = nightmareFactory();
    this._scraper = new TinyCardsScraper(this._nightmare, opts)
    this._email = opts.email
    this._smtpOptions = opts.smtp
    this._dbPath = join(process.cwd(), 'monitor.db')
    this._context = create(new Sequelize(null, null, null, {
      dialect: 'sqlite',
      storage: this._dbPath,
      logging: false
    }));
    this._logger = opts.logger;
    this._nightmareFactory = nightmareFactory;
    this._opts = opts;

    this._transport = nodemailer.createTransport({
      host: this._smtpOptions.host,
      port: this._smtpOptions.port,
      secure: false,
      auth: {
        user: this._smtpOptions.username,
        pass: this._smtpOptions.password
      }
    });

    this.isMonitoring = false;
  }

  async getAllIncomplete(decks) {
    const self = this;
    let allExpired = [];
    for (let deck of decks) {
      // get deck from database
      let fromDb = await self._context.MonitorRecord.findAll({
        where: {
          DeckUrl: deck.link
        }
      }).catch(err => this._logger.error(`Error getting deck from db ${err}`));

      /** @type {MonitorRecord} */
      let found = null;
      if (fromDb.length) found = fromDb[0]

      if (found && deck.progress && deck.progress !== self._completedProgress) {
        allExpired.push(deck);
      }
    }

    return allExpired;
  }

  async getNewlyExpired(decks) {
    const self = this;
    let newlyExpired = [];
    for (let deck of decks) {
      // get deck from database
      let fromDb = await self._context.MonitorRecord.findAll({
        where: {
          DeckUrl: deck.link
        }
      }).catch(err => this._logger.error(`Error getting deck from db ${err}`));

      /** @type {MonitorRecord} */
      let found = null;
      if (fromDb.length) found = fromDb[0]

      // if the deck has been completed, but is not expired
      if (found && deck.progress === self._completedProgress && !this._isExpired(found)) {
        //  expire the deck
        await self._context.MonitorRecord.update({
          LastNotified: self._expiredDate
        }, {
          where: {
            DeckUrl: found.DeckUrl
          }
        }).catch(err => self._logger.error(`Error expiring the completed deck. Deck: "${deck.name}". Err: "${err}"`));
        continue;
      }

      if (deck.progress === self._completedProgress || !deck.progress)
      {
        continue;
      }

      self._logger.debug(`Deck incomplete. Deck: "${deck.name}". Progress: "${deck.progress}."`);

      // if not found or if found and expired
      if (!found || self._isExpired(found)) {
        self._logger.debug(`Deck not found or is expired in DB. Notifying. Deck: "${deck.name}"."`);
        
        //  add to notification list
        newlyExpired.push(deck)

        if (found) {
          self._logger.debug(`Updating last notification time. Deck: "${deck.name}"."`);

          // update LastNotified
          // TODO: this should probably happen in _notify...
          await self._context.MonitorRecord.update({
            LastNotified: new Date()
          }, {
            where: {
              DeckUrl: found.DeckUrl
            }
          }).catch(err => self._logger.error(`Error updating monitor record last notified. ${err}`));
        } else {
          self._logger.debug(`Creating monitor record. Deck: "${deck.name}"."`);
          // insert monitor record
          await self._context.MonitorRecord.create(
            {
              DeckUrl: deck.link,
              LastNotified: new Date()
            }).catch(err => self._logger.error(`Error creating monitor record. ${err}`));
        }
      }
    }

    return newlyExpired;
  }

  monitor() {
    const self = this;
    self.isMonitoring = true;
    self._nightmare = self._nightmareFactory();
    self._scraper = new TinyCardsScraper(self._nightmare, self._opts);
    self._logger.info('Running monitor.');
    self._process();
  }

  _notify(decks, totalDecks, startedDecks) {
    const self = this
    self._logger.info('Sending notification of decks to study');
    if (!decks || !decks.length) return
    var subject = 'DuoLingo Monitor - ' + decks.length + ' decks need review'
    var body = ''
    for (var deck of decks) {
      body += deck.link + ' | ' + deck.progress + ' complete\n'
    }

    body += `\nTotal Progress: ${startedDecks}/${totalDecks} decks started (${((startedDecks / totalDecks) * 100).toFixed(2)} %)`

    var mail = {
      from: '"DuoLingo Monitor" <' + self._smtpOptions.username + '>',
      to: self._email,
      subject: subject,
      text: body
    }

    self._transport.sendMail(mail, error => {
      if (error) {
        this._logger.error(`error sending mail ${error}`);
      }
    })
  }

  async _process() {
    var self = this;
    self._logger.info('Processing monitor db.');

    // if it is 5:30 A.M
    var currentTime = new Date()
    if (currentTime.getHours() == 5
            && currentTime.getMinutes() >= 29
            && currentTime.getMinutes() <= 31) {
      this._logger.debug(`Expiring all decks for notifications. Setting date to "${self._expiredDate}"`);

      // expire everything
      await self._context.MonitorRecord.update({
        LastNotified: new Date(self._expiredDate)
      },
      {
        where: {
          LastNotified: {
            [Sequelize.Op.gt]: new Date(self._expiredDate)
          }
        }
      }).catch(err => this._logger.error(`Error processing records in monitor db ${err}`));
    }

    this._logger.info('Running scraper.');
    await self._scraper.login()
      .then(x => {
        return x.getDecks()
      })
      .catch(err => {
        this._logger.error(`Error retrieving decks ${err}`);
        this.isMonitoring = false;
      });

    if (!self._scraper.decks || !self._scraper.decks.length) return
    let decks = self._scraper.decks
    const newlyExpired = await self.getNewlyExpired(decks);

    if (newlyExpired && newlyExpired.length) {
      // notify with all expired
      const allExpired = await self.getAllIncomplete(decks);
      self._notify(allExpired, self._scraper.totalDecks, self._scraper.startedDecks);
    }

    self.isMonitoring = false;
  }

  /** @param monitorRecord {MonitorRecord} */
  _isExpired(monitorRecord) {
    this._logger.debug(`Checking if monitor record is expired. Deck URL: "${monitorRecord.DeckUrl}". Last notified: "${monitorRecord.LastNotified}"`)
    // true if last seen is more than 12 hours
    return new Date().getTime() - new Date(monitorRecord.LastNotified).getTime() > 43200000
  }
}