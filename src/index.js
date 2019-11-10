import 'core-js/stable';
import 'regenerator-runtime/runtime';
import config from '../config.json';
import Monitor from './monitoring/tiny-cards-monitor';
import Nightmare from 'nightmare';
import winston from 'winston';

var nightmare = new Nightmare();
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

config.logger = logger;

var monitor = new Monitor(nightmare, config)

monitor.monitor();

setInterval(() => {
  monitor.monitor();
}, 300000);