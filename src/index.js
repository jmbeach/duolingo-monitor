import 'core-js/stable';
import 'regenerator-runtime/runtime';
import config from '../config.json';
import fs from 'fs';
import Monitor from './monitoring/tiny-cards-monitor';
import Nightmare from 'nightmare';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, label, timestamp }) => {
      return `${timestamp} ${level}: ${message}`;
    }),
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'tinycards.log' })
  ]
});

try {
  if (!fs.existsSync('monitor.db')) {
    fs.copyFile('template.db', 'monitor.db', err => {
      logger.debug(`Could not create monitor.db. Error: ${err}.`);
    });
  }
} catch (err) {
  logger.debug(`Unhandled error creating monitor.db. Error: ${err}.`);
}

config.logger = logger;
const nightmareFactory = () => {
  return new Nightmare();
};

var monitor = new Monitor(nightmareFactory, config)

const startMonitor = async () => {
  monitor.monitor();
  setInterval(async () => {
    if (monitor.isMonitoring) return;
    monitor.monitor();
  }, 250);
}

startMonitor();