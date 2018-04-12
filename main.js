var subito = require("./subito_scraper.js");

const nconf = require('nconf');
nconf.file("config.json");

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

const insertions_interval_checker_seconds = nconf.get("insertions_interval_checker_seconds");

var express = require('express');
var app = express();
var port = process.env.PORT || 8080;

app.listen(port, function () {
  console.log('Our app is running on http://localhost:' + port);
});

app.get('/', function(req, res) {
  res.send('hello');
});



var http = require('http'); //importing http

function startKeepAlive() {
  setInterval(function () {
    var options = {
      host: 'still-dusk-84428.herokuapp.com',
      port: 80,
      path: '/'
    };
    http.get(options, function (res) {
      res.on('data', function (chunk) {
        try {
          // optional logging... disable after it's working
          console.log("HEROKU RESPONSE: " + chunk);
        } catch (err) {
          console.log(err.message);
        }
      });
    }).on('error', function (err) {
      console.log("Error: " + err.message);
    });
  }, 20 * 60 * 1000); // load every 20 minutes
}

startKeepAlive();



//subito.start(researches);
setInterval(function () {
  //subito.start(researches);
console.log("VADO VADO VADO");

}, 1000 * insertions_interval_checker_seconds);
