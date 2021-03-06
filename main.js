var subito = require("./subito_scraper");
var motoit = require("./motoit_scraper");
var autoscout = require("./autoscout_scraper");
const nconf = require('nconf');
const Bottleneck = require('bottleneck');
var db_manager_class = require("./db_manager");
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 5000
});

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
var db_manager = new db_manager_class();

//const res_tmp = nconf.get("researches");

let db;
(async () => {

  db = await db_manager.create_db();
  db_manager.create_table_insertions(db);

  const res_tmp = await api.get_research(true);
  for (let k in res_tmp) {
    //for (let i = 0; i < res_tmp[k].length; ++i) {
    // if (!res_tmp[k][i].id) {
    //   throw new Error("problema configurazione!!!");
    // }
    // researches[res_tmp[k][i].id] = res_tmp[k][i];
    // researches[res_tmp[k][i].id].recipient = k;
    researches[res_tmp[k].id] = res_tmp[k];
    researches[res_tmp[k].id].send_email = nconf.get("email");
    //researches[res_tmp[k].id].recipient = k;
    //}
  }

  for (let r in researches) {

    if (researches[r].url.indexOf(".subito.it") > -1) {
      (new subito(log,  db_manager, db)).start(researches[r]);
    } else if (researches[r].url.indexOf(".moto.it") > -1) {
      (new motoit(log, db_manager, db)).start(researches[r]);
    } else if (researches[r].url.indexOf(".autoscout24.it") > -1) {
      (new autoscout(log, db_manager, db)).start(researches[r]);
    }

    await sleep(2000);

  }

})();

async function sleep(ms) {
  return new Promise(r => { setTimeout(r, ms) });
}