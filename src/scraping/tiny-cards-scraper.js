import {writeFileSync, existsSync, readFileSync} from 'fs'

class TinyCardsScraper {
  constructor(nightmare, opts) {
    this._tinyCardsHome = 'https://tinycards.duolingo.com/'
    this._btnLoginSelector = 'LOG IN WITH DUOLINGO'
    this._inputUserSelector = 'input[name="identifier"]'
    this._inputPassSelector = 'input[name="password"]'
    this._btnLoginSubmitSelector = 'button[type="submit"]'
    this._progressClass = '_3iOsQ'
    this._deckClass = '_1-ygB _1i9iG'
    this._activeDeckClass = '_3qc77 _1vqs9'
    this._deckUnstartedClass = '_27a_4'
    this._activeIncompleteDeckClass = '_2SILG _1-nKn'
    this._courseSelector = '#root > div > div._8SfjL'
    this._homeSelector = '#root > div > div.op3wk > div > div:nth-child(3) > div.dNvt9 > div:nth-child(4) > div._3VMGd > a:nth-child(1)'
    this._cookieFile = './cookie'
    this._courseUrl = opts.courseUrl
    this._username = opts.username
    this._password = opts.password
    this._nightmare = nightmare
    this._nightmare.useragent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Safari/537.36')
    this.decks = []
  }

  login() {
    const self = this

    self._nightmare
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
    return self
  }

  async getDecks() {
    const self = this
    self.decks = []

    var openCourse = await self._nightmare
      .wait(5000)
      .evaluate((courseUrl) => {
        var links = document.getElementsByTagName('a')
        for (var link of links) {
          if (link.href.toLowerCase() === courseUrl.toLowerCase()) {
            link.click()
          }
        }
      }, self._courseUrl)

    var allDecks = await self._nightmare
      .wait(2000)
      .evaluate((deckClass, progressClass) => {
        return new Promise(resolve => {
          var result = []
          var decks = document.getElementsByClassName(deckClass)
          var searchProcessed = function(link) {
            for (var res of result) {
              if (res.link == link) return res
            }

            return false
          }
          var processResults = function() {
            for (var deck of decks) {
              var deckStatus = {}
              var deckLink = deck.getElementsByTagName('a')[0]
              deckStatus.link = deckLink.href
              if (searchProcessed(deckStatus.link)) continue
              deckStatus.name = deckLink.firstChild.innerText
              var progressBar = deck.getElementsByClassName(progressClass)[0]
              if (!progressBar) return
              deckStatus.progress = progressBar.style.width
              result.push(deckStatus)
            }
          }

          var findLastStarted = function(lastResult, decks) {
            for (var deck of decks) {
              var link = deck.getElementsByTagName('a')[0]
              if (link.href == lastResult.link) return link
            }
            
            return null
          }

          var decks = document.getElementsByClassName(deckClass)
          var lastResultCount = 0
          var doLoad = true
          var scrollLoop = function() {
            if (!doLoad) return
            processResults()
            if (result.count == lastResultCount) {
              doLoad = false
              var lastResult = result[result.length - 1]
              findLastStarted(lastResult, decks).click()
              resolve(result)
            }

            lastResultCount = result.count
            decks[decks.length - 1].scrollIntoView()
            decks = document.getElementsByClassName(deckClass)
          }

          scrollLoop()
          setInterval(scrollLoop, 3000)

          return result
        })
      }, self._deckClass, self._progressClass)

      self.decks = allDecks

      var accurateProgress = await self._nightmare
        .wait(2000)
        .evaluate((activeDeckClass, progressClass, unstartedClass) => {
          var activeDecks = document.getElementsByClassName(activeDeckClass)
          var complete = 0
          var incomplete = 0
          var percentage = 0.0
          console.log(activeDecks.length)
          for (var deck of activeDecks) {
            var progress = deck.getElementsByClassName(progressClass)
            var unstarted = deck.getElementsByClassName(unstartedClass)
            console.log("progress")
            console.log(progress.length)
            console.log("unstarted")
            console.log(unstarted.length)
            if (unstarted.length) continue
            if (progress.length) {
              incomplete++
            } else {
              complete ++
            }
          }

          console.log(complete)
          console.log(incomplete)
          if (complete + incomplete != 0) {
            percentage = (complete / (complete + incomplete)) * 100
          } 

          percentage += "%"

          return percentage
        }, self._activeDeckClass, self._activeIncompleteDeckClass, self._deckUnstartedClass)
      self.decks[self.decks.length - 1].progress = accurateProgress
    return self
  }
}

module.exports = TinyCardsScraper