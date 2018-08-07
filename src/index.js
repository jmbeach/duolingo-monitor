//import 'babel-polyfill'
import Monitor from './monitoring/tiny-cards-monitor';
import config from '../config.json';
import Nightmare from "nightmare";

var nightmare = Nightmare({show:true})
var monitor = new Monitor(nightmare, config)
monitor.monitor()

setInterval(() => {
    var nightmare = Nightmare({show:true})
    var monitor = new Monitor(nightmare, config)
    monitor.monitor()
}, 60000)