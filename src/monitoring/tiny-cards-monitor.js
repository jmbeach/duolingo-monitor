import {create} from './models/context'
import Sequelize from "sequelize";
import { join } from 'path';
import nodemailer from 'nodemailer';
import TinyCardsScraper from '../scraping/tiny-cards-scraper';

export default class TinyCardsMonitor {
    constructor(nightmare, opts) {
        this._scraper = new TinyCardsScraper(nightmare, opts)
        this._email = opts.email
        this._smtpOptions = opts.smtp
        this._context = create(new Sequelize(null, null, null, {
            dialect: 'sqlite',
            storage: join(process.cwd(), 'monitor.db'),
            logging: false
        }))

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
        var self = this
        self._process()
        setInterval(async () => {
            await self._process()
        //}, 3600000);
        }, 60000);
    }

    _notify(decks) {
        var self = this
        if (!decks || !decks.length) return
        var subject = 'DuoLingo Monitor - ' + decks.length + ' decks need review'
        var body = ''
        for (var deck of decks) {
            body += deck.link + '\n'
        }

        var mail = {
            from: '"DuoLingo Monitor" <' + self._smtpOptions.username + '>',
            to: self._email,
            subject: subject,
            text: body
        }

        self._transport.sendMail(mail, error => {
            if (error) {
                return console.log(error)
            }
        })
    }

    async _process() {
        var self = this

        // if it is 5:00 A.M
        if (new Date().getHours() == 5) {
            // expire everything
            await self._context.MonitorRecord.update({
                LastSeen: new Date('1997-01-01')
            })
        }

        await self._scraper.login()
            .getDecks()
        self._scraper._nightmare.end()
        var decks = self._scraper.decks
        var toNotify = []
        for (var deck of decks) {
            // get deck from database
            var fromDb = await self._context.MonitorRecord.findAll({
                where: {
                    DeckUrl: deck.link
                }
            })

            var found = null
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
                    })
                } else {
                    // insert monitor record
                    await self._context.MonitorRecord.create(
                        {
                            DeckUrl: deck.link,
                            LastNotified: new Date()
                        })
                }
            }

        }

        self._notify(toNotify)
    }

    _isExpired(monitorRecord) {
        // true if last seen is more than an hour ago
        return new Date() - monitorRecord.LastSeen < 3600000
    }
}