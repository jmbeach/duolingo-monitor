import 'babel-polyfill'
import Nightmare from 'nightmare';
import TinyCardsScraper from '../src/scraping/tiny-cards-scraper.js'
import assert from 'assert';
import config from '../config.json';

describe('tiny cards monitor', function () {
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

  describe('#getDeckDetails', () => {
    it('should get details of specific deck', async () => {
      var accurateProgress = await nightmare
        .goto(`file://${__dirname}/static-pages/deck-details-page.html`)
        .evaluate(scraper._getDeckProgress,
          scraper._activeDeckClass,
          scraper._progressClass,
          scraper._completedClass)
      assert.equal('33.33%', accurateProgress);
      accurateProgress = await nightmare
        .goto(`file://${__dirname}/static-pages/deck-details-complete.html`)
        .evaluate(scraper._getDeckProgress,
          scraper._activeDeckClass,
          scraper._progressClass,
          scraper._completedClass)
      assert.equal('100.00%', accurateProgress);
      await nightmare.end()
    })
  })
})