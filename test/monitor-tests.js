import 'babel-polyfill'
import Nightmare from 'nightmare';
import TinyCardsMonitor from '../src/monitoring/tiny-cards-monitor.js'
import { notEqual } from 'assert';
import config from '../config.json';

describe('tiny cards monitor', function() {
  let nightmare = null
  let monitor = null

  beforeEach(() => {
    nightmare = Nightmare({
      show: true,
      openDevTools: {
        mode: 'detach'
      }
    })

    monitor = new TinyCardsMonitor(nightmare, config)
  })

  describe('#getDecks', () => {
    it('should get all decks that need studying', async done => {
      await monitor.login()
        .getDecks()
      monitor._nightmare.end()
      notEqual(monitor.decks.length, 0)
    }).timeout(900000)
  })
})