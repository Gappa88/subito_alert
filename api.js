const express = require('express');
const app = express();
const port = process.env.PORT || 8080;
const http = require('http'); //importing http
var log = null;
const db_manager_class = require("./db_manager");
const bodyParser = require('body-parser');
const db_manager = new db_manager_class();

// parse requests of content-type - application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));

// parse requests of content-type - application/json
app.use(bodyParser.json());

app.listen(port, function () {
    console.log('Our app is running on http://localhost:' + port);
});

app.get('/', function (req, res) {
    res.send('hello');
});

app.get('/api/get_research', async function (req, res) {
    try {
        if (!req.query && !req.query.name) {
            res.status(400).send(new Error("errore nei parametri"));
            return;
        }
        let db_conn = await db_manager.create_db();
        let rese = await db_manager.get_research(db_conn, req.query.name);
        await db_manager.close(db_conn);
        if (rese.rows)
            res.send(rese.rows);
        else
            res.send("nessuna ricerca presente");
    } catch (err) {
        res.status(400).send(err);
    }
});

app.post('/api/insert_research', async function (req, res) {
    try {
        if (Object.keys(res.body) < 4) {
            res.status(400).send(new Error("errore nei parametri"));
            return;
        }
        let db_conn = await db_manager.create_db();
        await db_manager.insert_research(db_conn, res.body);
        await db_manager.close(db_conn);
        res.send("ok");
    } catch (err) {
        res.status(400).send(err);
    }
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

function set_log(_log) {
    log = _log;
}

module.exports = {
    startKeepAlive: startKeepAlive,
    set_log: set_log
}