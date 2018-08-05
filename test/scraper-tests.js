import 'babel-polyfill'
import Nightmare from 'nightmare';
import TinyCardsScraper from '../src/monitoring/tiny-cards-monitor.js'
import { notEqual } from 'assert';
import config from '../config.json';

describe('tiny cards monitor', function() {
  let nightmare = null
  let scraper = null

  beforeEach(() => {
    nightmare = Nightmare({
      show: true,
      openDevTools: {
        mode: 'detach'
      }
    })

    scraper = new TinyCardsScraper(nightmare, config)
  })

  describe('#getDecks', () => {
    it('should get all decks that need studying', async done => {
      await scraper.login()
        .getDecks()
      scraper._nightmare.end()
      notEqual(scraper.decks.length, 0)
    }).timeout(900000)
  })
})