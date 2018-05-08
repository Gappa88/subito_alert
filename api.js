const express = require('express');
const app = express();
const port = process.env.PORT || 8080;
const http = require('http'); //importing http
var log = null;

app.listen(port, function () {
    console.log('Our app is running on http://localhost:' + port);
});

app.get('/', function (req, res) {
    res.send('hello');
});

app.get('/api/insertions', function(req, res){

});


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

function set_log(_log){
    log = _log;
}

module.exports = {
    startKeepAlive: startKeepAlive,
    set_log:set_log
}