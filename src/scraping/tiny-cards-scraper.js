import winston from 'winston';
import Nightmare from 'nightmare';

class TinyCardsScraper {
  /**
   * @param opts {{logger: winston.Logger}}
   * @param nightmare {Nightmare}
  */
  constructor(nightmare, opts) {
    this._activeDeckClass = '_2MMwG'
    this._activeIncompleteDeckClass = '_1-IZO RMHAA'
    this._btnLoginSelector = 'LOG IN WITH DUOLINGO'
    this._btnLoginSubmitSelector = 'button[type="submit"]'
    this._completedClass = '_1_no8'
    this._cookieFile = './cookie'
    this._courseSelector = '#root > div > div._8SfjL'
    this._courseUrl = opts.courseUrl
    this._deckClass = '_1-ygB _1i9iG'
    this._inputPassSelector = 'input[name="password"]'
    this._inputUserSelector = 'input[name="identifier"]'
    this._logger = opts.logger;
    this._nightmare = nightmare
    this._nightmare.useragent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36')
    this._password = opts.password
    this._progressClass = '_2E6HG'
    this._progressClassOuter = '_3iOsQ'
    this._tinyCardsHome = 'https://tinycards.duolingo.com/'
    this._username = opts.username
    /** @type {Array<{link: string, name: string, progress: string}>} */
    this.decks = [];
    this.startedDecks = 0;
    this.totalDecks = 0;
  }

  async login() {
    const self = this
    self.decks = [];
    self._logger.info('Logging in to tiny cards.');
    return self._nightmare
      .goto(self._tinyCardsHome)
      .evaluate((buttonSelector) => {
        var buttons = document.getElementsByTagName('button')
        for (var button of buttons) {
          if (button.innerText.toLowerCase() === buttonSelector.toLowerCase()) {
            button.click()
          }
        }
      }, self._btnLoginSelector)
      .type(self._inputUserSelector, self._username)
      .type(self._inputPassSelector, self._password)
      .click(self._btnLoginSubmitSelector)
      .then(() => self)
      .catch(err => self._logger.error(`Error logging in ${err}.`));
  }

  async getDecks() {
    const self = this
    self._logger.info('Getting decks from tiny cards.');
    self.decks = []

    self._logger.info('Opening the tiny cards course.');
    await self._nightmare
      .wait(5000)
      .evaluate((courseUrl) => {
        const links = document.getElementsByTagName('a')
        for (var link of links) {
          if (link.href.toLowerCase() === courseUrl.toLowerCase()) {
            link.click()
          }
        }
      }, self._courseUrl)
      .then(x => x)
      .catch(err => {
        self._logger.error(`Error getting course. Err: "${err}".`);
        self._nightmare.end().then(x => x);
        return
      });

    self._logger.info('Getting all the decks from course.');
    var allDecks = await self._nightmare
      .wait(2000)
      .evaluate(self._getAllDecks, self._deckClass, self._progressClassOuter)
      .catch(err => {
        self._logger.error(`Error getting all decks. Err: "${err}".`);
        self._nightmare.end().then(x => x);
        return
      });

    if (!allDecks) throw 'could not retrieve decks';

    self.decks = allDecks.decks
    self.totalDecks = allDecks.totalDecks
    self.startedDecks = allDecks.startedDecks

    self._logger.info('Getting accurate progress from all decks.');
    const accurateProgress = await self._nightmare
      .wait(2000)
      .evaluate(self._getDeckProgress,
        self._activeDeckClass,
        self._progressClass,
        self._completedClass)
      .catch(err => {
        self._logger.error(`Error getting detailed progress for deck. Err: "${err}".`);
        self._nightmare.end().then(x => x);
        return
      })

    self.decks[self.decks.length - 1].progress = accurateProgress

    self._logger.info('Closing the browser.');
    await self._nightmare.end().then(x => x);

    return self
  }

  _getAllDecks(deckClass, progressClass) {
    return new Promise(resolve => {
      var result = []
      var decks = document.getElementsByClassName(deckClass)
      var searchProcessed = function (link) {
        for (var res of result) {
          if (res.link == link) return res
        }

        return false
      }

      var processResults = function () {
        for (var deck of decks) {
          var deckStatus = {}
          var deckLink = deck.getElementsByTagName('a')[0]
          deckStatus.link = deckLink.href
          if (searchProcessed(deckStatus.link)) continue
          deckStatus.name = deckLink.firstChild.innerText
          var progressBar = deck.getElementsByClassName(progressClass)[0]
          if (!progressBar) return
          deckStatus.progress = parseFloat(progressBar.style.width).toFixed(2) + "%"
          result.push(deckStatus)
        }
      }

      var findLastStarted = function (lastResult, decks) {
        for (var deck of decks) {
          var link = deck.getElementsByTagName('a')[0]
          if (link.href == lastResult.link) return link
        }

        return null
      }

      var decks = document.getElementsByClassName(deckClass)
      var lastResultCount = 0
      var lastTotalResultCount = 0
      var doLoad = true
      var scrollLoop = function () {
        if (!doLoad) return

        // if we haven't processed all of the activeDecks
        if (result.length < 1 || result.length != lastResultCount) {
          lastResultCount = result.length
          processResults()
        } else if (decks.length != lastTotalResultCount) {
          // keep scrolling
        } else {
          doLoad = false
          var deckLength = decks.length
          var decksWithProgressCount = document.getElementsByClassName(progressClass).length

          var lastResult = result[result.length - 1]
          findLastStarted(lastResult, decks).click()
          resolve({
            decks: result,
            startedDecks: decksWithProgressCount,
            totalDecks: deckLength
          })
        }

        if (!doLoad) return
        lastTotalResultCount = decks.length
        decks[decks.length - 1].scrollIntoView()
        decks = document.getElementsByClassName(deckClass)
      }

      scrollLoop()
      setInterval(scrollLoop, 3000)

      return result
    });
  }

  _getDeckProgress(activeDeckClass, progressClass, completedClass) {
    var activeDecks = document.getElementsByClassName(activeDeckClass)
    var complete = 0
    var incomplete = 0
    var unstarted = 0
    var percentage = 0.0

    for (var deck of activeDecks) {
      var progress = deck.getElementsByClassName(progressClass)
      var completed = deck.getElementsByClassName(completedClass)

      if (completed.length) {
        complete++;
      } else if (progress.length) {
        if (progress[0].style.width !== '0%') {
          incomplete++
        } else {
          unstarted++
        }
      }
    }

    if (complete + incomplete != 0) {
      percentage = (complete / (complete + incomplete)) * 100
    }

    return percentage.toFixed(2) + '%'
  }
}

export default TinyCardsScraper;