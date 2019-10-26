import { create } from './models/context'
import Sequelize from 'sequelize';
import { join } from 'path';
import nodemailer from 'nodemailer';
import TinyCardsScraper from '../scraping/tiny-cards-scraper';
import winston from 'winston';

export default class TinyCardsMonitor {
  /** @param opts {{logger: winston.Logger}} */
  constructor(nightmare, opts) {
    this._unexpiredDate = '1997-01-01'
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
    this._logger.info('Running monitor.');
    var self = this
    self._process()
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
      // expire everything
      await self._context.MonitorRecord.update({
        LastNotified: new Date(self._unexpiredDate)
      },
      {
        where: {
          LastNotified: {
            [Sequelize.Op.gt]: new Date(self._unexpiredDate)
          }
        }
      }).catch(err => this._logger.error(`Error processing records in monitor db ${err}`));
    }

    this._logger.info('Running scraper.');
    await self._scraper.login()
      .getDecks()
      .catch(err => {
        this._logger.error(`Error retrieving decks ${err}`);
      });

    if (!self._scraper.decks || !self._scraper.decks.length) return
    var decks = self._scraper.decks
    var toNotify = []
    for (var deck of decks) {
      if (deck.progress == self._completedProgress) continue
      // get deck from database
      var fromDb = await self._context.MonitorRecord.findAll({
        where: {
          DeckUrl: deck.link
        }
      }).catch(err => this._logger.error(`Error getting deck from db ${err}`));

      var found = null;
      if (fromDb.length) found = fromDb[0]

      // if not found or if found and expired
      if (!found || self._isExpired(found)) {
        //  add to notification list
        toNotify.push(deck)

        if (found) {
          //  update LastNotified
          await self._context.MonitorRecord.update({
            LastNotified: new Date()
          }, {
            where: {
              DeckUrl: found.DeckUrl
            }
          }).catch(err => this._logger.error(`Error updating monitor record last notified. ${err}`));
        } else {
          // insert monitor record
          await self._context.MonitorRecord.create(
            {
              DeckUrl: deck.link,
              LastNotified: new Date()
            }).catch(err => this._logger.error(`Error creating monitor record. ${err}`));
        }
      }

    }

    self._notify(toNotify, self._scraper.totalDecks, self._scraper.startedDecks)
  }

  _isExpired(monitorRecord) {
    // true if last seen is more than an hour ago
    return new Date() - new Date(monitorRecord.LastNotified) > 3600000
  }
}