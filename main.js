var subito = require("./subito_scraper.js");

subito.start();
 setInterval(function () {
   subito.start();
 }, 1000 * 60  * 60);
