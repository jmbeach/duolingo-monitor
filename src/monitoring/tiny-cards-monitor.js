import { create } from './models/context'
import Sequelize from 'sequelize';
import { join } from 'path';
import nodemailer from 'nodemailer';
import TinyCardsScraper from '../scraping/tiny-cards-scraper';
import winston from 'winston';

export default class TinyCardsMonitor {
  /** @param opts {{logger: winston.Logger}} */
  constructor(nightmare, opts) {
    this._expiredDate = '1997-01-01'
    this._completedProgress = '100.00%'
    this._scraper = new TinyCardsScraper(nightmare, opts)
    this._email = opts.email
    this._smtpOptions = opts.smtp
    this._dbPath = join(process.cwd(), 'monitor.db')
    this._context = create(new Sequelize(null, null, null, {
      dialect: 'sqlite',
      storage: this._dbPath,
      logging: false
    }));
    this._logger = opts.logger;

    this._transport = nodemailer.createTransport({
      host: this._smtpOptions.host,
      port: this._smtpOptions.port,
      secure: false,
      auth: {
        user: this._smtpOptions.username,
        pass: this._smtpOptions.password
      }
    })
  }

  monitor() {
    const self = this;
    self._logger.info('Running monitor.');
    return self._process();
  }

  _notify(decks, totalDecks, startedDecks) {
    this._logger.info('Sending notification of decks to study');
    var self = this
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
    this._logger.info('Processing monitor db.');

    var self = this

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
      .then(x => x.getDecks())
      .catch(err => {
        this._logger.error(`Error retrieving decks ${err}`);
      });

    if (!self._scraper.decks || !self._scraper.decks.length) return
    let decks = self._scraper.decks
    let toNotify = []
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

      if (deck.progress === self._completedProgress)
      {
        continue;
      }

      self._logger.debug(`Deck incomplete. Deck: "${deck.name}". Progrress: "${deck.progress}."`);

      // if not found or if found and expired
      if (!found || self._isExpired(found)) {
        self._logger.debug(`Deck not found or is expired in DB. Notifying. Deck: "${deck.name}"."`);
        
        //  add to notification list
        toNotify.push(deck)

        if (found) {
          self._logger.debug(`Updating last notification time. Deck: "${deck.name}"."`);

          //  update LastNotified
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

    self._notify(toNotify, self._scraper.totalDecks, self._scraper.startedDecks)
  }

  /** @param monitorRecord {MonitorRecord} */
  _isExpired(monitorRecord) {
    this._logger.debug(`Checking if monitor record is expired. Deck URL: "${monitorRecord.DeckUrl}". Last notified: "${monitorRecord.LastNotified}"`)
    // true if last seen is more than an hour ago
    return new Date().getTime() - new Date(monitorRecord.LastNotified).getTime() > 3600000
  }
}