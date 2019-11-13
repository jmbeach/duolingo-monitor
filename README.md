DuoLingo Monitor
========

A monitor that notifies you when you have DuoLingo TinyCards decks that need studying.

# Installation

To install:

- Clone the repo
- `npm install`
- copy the file `config-template.json` to `config.json` in the repo directory and fill it out
- run `npm run debug` (you'll need to attach to the node process. You can use the "Attach" vscode profile)

Note:

- The application relies on a sqlite database named "monitor.db". This file is normally created by copying the file "template.db" and calling it "monitor.db". If you're experiencing issues with the database, you may need to create it manually.