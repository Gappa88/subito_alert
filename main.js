var subito = require("./subito_scraper.js");
const nconf = require('nconf');
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;
const myFormat = printf(info => {
  return `${info.timestamp} ${info.level}: ${info.message}`;
});
const log = createLogger({
  format: combine(
    timestamp(),
    myFormat
  ),
  transports: [
    new transports.Console(),
    new transports.File({
      filename: 'scraping_subito.log',
      level: 'info'
    })]
});

nconf.file("config.json");

const api = require("./api");
api.set_log(log);
api.startKeepAlive();

const researches = {};
const res_tmp = nconf.get("researches");
for (let k in res_tmp) {
  for (let i = 0; i < res_tmp[k].length; ++i) {
    if (!res_tmp[k][i].id) {
      throw new Error("problema configurazione!!!");
    }
    researches[res_tmp[k][i].id] = res_tmp[k][i];
    researches[res_tmp[k][i].id].recipient = k;
  }
}



for (let r in researches) {
  let scraper = new subito(log);
  scraper.start(researches[r]);
  setInterval(function () {    
    let scraper2 = new subito(log);
    scraper2.start(researches[r]);
  }, researches[r].insertions_interval_checker_seconds * 1000);
}
