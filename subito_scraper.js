"use strict";

const now = new Date().getTime();

const rp = require('request-promise');
const cheerio = require('cheerio');
const nconf = require('nconf');
nconf.file("config.json");
const sqlite3 = require('sqlite3').verbose();
const url_parser = require('url');
const mail = require('./send_mail.js')

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

const promiseUntil = require('promise-until');

var researches = {};
const res_tmp = nconf.get("researches");
for (let i = 0; i < res_tmp.length; ++i) {
    if (!res_tmp[i].id)
        throw new Error("problema configurazione!!!");

    researches[res_tmp[i].id] = res_tmp[i];
}

var all_insertions_inserted = {};
var all_insertions_updated = {};

var db = null;

module.exports.start = function () {
    init().then(() => {
        return main();
    }).catch(err => {
        log.error(err);
    }).then(() => {
        if (db) {
            db.close();
        }

        print_report();

        console.log("Fine");
        log.info("Fine");

    }).catch(err => {
        log.error(err);
    });
}

function print_report() {

    //let body_mail = "";
    //log.info("Nuove Inserzioni " + all_insertions_inserted.length + ":");
    // for (let i in all_insertions_inserted) {
    //     //body_mail += "\n" + JSON.stringify(all_insertions_inserted[i]);
    //     log.info(JSON.stringify(all_insertions_inserted[i]));
    // }

    //log.info("Inserzioni Modificate " + all_insertions_updated.length + ":");
    // for (let i in all_insertions_updated) {
    //     //body_mail += "\n" + JSON.stringify(all_insertions_updated[i]);
    //     log.info(JSON.stringify(all_insertions_updated[i]));
    // }

    let inserts = "";
    for (let i in all_insertions_inserted) {
        for (let k = 0; k < all_insertions_inserted[i].length; ++k) {
            for (let l in all_insertions_inserted[i][k]) {
                if (l == 'id_research') {
                    inserts += "<tr><td>" + l + "</td>";
                    inserts += "<td>" + researches[all_insertions_inserted[i][k][l]].name + "</td></tr>";
                } else {
                    inserts += "<tr><td>" + l + "</td>";
                    inserts += "<td>" + all_insertions_inserted[i][k][l] + "</td></tr>";
                }
            }
        }
    }

    let updates = "";
    for (let i in all_insertions_updated) {
        for (let k = 0; k < all_insertions_updated[i].length; ++k) {
            for (let l in all_insertions_inserted[i][k]) {
                if (l == 'id_research') {
                    updates += "<tr><td>" + l + "</td>";
                    updates += "<td>" + researches[all_insertions_updated[i][k][l]].name + "</td></tr>";
                } else {
                    updates += "<tr><td>" + l + "</td>";
                    updates += "<td>" + all_insertions_updated[i][k][l] + "</td></tr>";
                }
            }
        }
    }

    if (inserts || updates) {

        let table = "<table style='border: 1px solid black' border='1'>";
        table += "<tr><th colspan='2'>Nuovi Inserimenti:</th>";
        table += inserts;
        table += "<tr><th colspan='2'>Aggiornamenti:</th>";
        table += updates;
        table += "</table>";

        mail.send_mail('gappa88@gmail.com', 'report', "", table).then(ret => {
            log.info("mail inviata");
        }).catch(err => {
            console.error(err);
            log.error("errore invio email: " + JSON.stringify(err));
        });
    }

    for (let k in all_insertions_inserted) {
        if (all_insertions_inserted[k] instanceof Array) {
            all_insertions_inserted[k].length = 0;
            all_insertions_inserted[k] = null;
        }
        delete all_insertions_inserted[k];
    }
    all_insertions_inserted = null;
    all_insertions_inserted = {};

    for (let k in all_insertions_updated) {
        if (all_insertions_updated[k] instanceof Array) {
            all_insertions_updated[k].length = 0;
            all_insertions_updated[k] = null;
        }
        delete all_insertions_updated[k];
    }
    all_insertions_updated = null;
    all_insertions_updated = {};
}


//******************************************* */
// controllo presenza tabelle
function init() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database('./urls.db', (err) => {
            if (err) {
                log.error(err.message);
                throw err;
            }
            console.log('Connected to the urls database.');

            create_table_insertions()
                // .then(() => {
                //   return create_table_researches();
                // })
                .then(() => {
                    resolve();
                }).catch((err) => {
                    reject(err);
                });
        });
    });
}
//******************************************* */

function main() {
    return new Promise((resolve, reject) => {
        // TODO: mettere paginazione con controlli
        var options = [];
        //for (let i = 0; i < researches.length; ++i) {
        for (let i in researches) {
            options.push({
                research_id: i,
                uri: researches[i].url,
                transform: function (body) {
                    return cheerio.load(body);
                }
            });
        }

        Promise.all(options.map(o => { return rp(o); }))
            .then(pages => {

                for (let i = 0; i < pages.length; ++i) {

                    options[i].max_page_number = 1;

                    let $ = pages[i];

                    let url = $("div.pagination_bottom_link").find("a").attr("href");
                    if (url) {
                        let url_parts = url_parser.parse(url, true);
                        if (url_parts.query.o) {
                            options[i].max_page_number = parseInt(url_parts.query.o);
                        }
                    }
                }

                Promise.all(options.map(crawl))
                    .then(function (ret) {

                        return get_number_of_rows_inserted();

                    }).then(n => {
                        log.info("numero inseriti: " + n[0].changes);
                        return resolve();
                    }).catch(err => {
                        return reject();
                    });

                /*
                    // richiesta al link delle ricerche per ottenere la pagina delle inserzioni principale
                    Promise.all(options.map(o => { return rp(o); }))
                      .then(function (ret) {
                
                        // ottengo il nuemro di inserzioni totale.
                        let promise_array = [];
                        for (let i = 0; i < ret.length; ++i) {
                          let $ = ret[i];
                          let text = $("#advertiser_type_dropdown_button").text();
                          let n_adv = text.match(/\d+/);
                          if (n_adv.length > 0) {
                            n_insertions.push(n_adv[0]);
                          } else {
                            n_insertions.push(0);
                          }
                          insertions.push(ret[i]);
                
                          // ottenfo dal db la lista delle inserzioni salvate in precedenza
                          promise_array.push(get_insertions_by_research_id(researches[i].id));
                        }
                
                        return Promise.all(promise_array);
                
                      }).then(stored_insertions => {
                
                        let promise_array = [];
                        for (let i = 0; i < insertions.length; ++i) {
                
                          // devo ciclare la pagina, inserire le inserzioni nuove e modificare quelle già esistenti
                          let $ = insertions[i];
                          let new_ins_list = $("article.item_list.view_listing");
                
                          // leggo tutte le inserzioni della pagina, estraggo le informazioni e le confronto con le precedenti
                          // per verificare che siano uguali. Se differiscono aggiorno.
                          new_ins_list.map((idx, v) => {
                            let $ = cheerio.load(v);
                            let data_id = $("article.item_list.view_listing").attr("data-id");
                            let a = $("div.item_list_section.item_description").find("a");
                            let url = a.attr("href");
                            let description = a.text().trim();
                            let price = $("div.item_list_section.item_description").find("span.item_price").text().trim();
                            let location = $("span.item_info.item_info_motori").find("span.item_location").text().trim();
                            let extras = $("div.item_extra_data").find("li");
                            let extras_values = [];
                            for (let j = 0; j < extras.length; ++j) {
                              let val = $(extras[j]).text().trim();
                              if (val)
                                extras_values.push(val);
                            }
                
                            let ins_obj = {
                              id_research: researches[i].id,
                              data_id: data_id,
                              url: url,
                              description: description,
                              price: price,
                              location: location,
                              extras: JSON.stringify(extras_values)
                            };
                
                            if (!stored_insertions[i] || !stored_insertions[i].length) {
                              promise_array.push(insert_insertion_or_update(ins_obj));
                
                            } else {
                
                              // super velocità ???
                              let j = 0; const iMax = stored_insertions[i].length;
                              for (; j < iMax; j++) {
                
                                if (stored_insertions[i][j].data_id == data_id && (
                                  stored_insertions[i][j].url != url ||
                                  stored_insertions[i][j].description != description ||
                                  stored_insertions[i][j].price != price ||
                                  stored_insertions[i][j].location != location
                                )) {
                                  console.log(stored_insertions[i][j]);
                                  promise_array.push(insert_insertion_or_update(ins_obj));
                                  break;
                                }
                
                              }
                            }
                          });
                        }
                        return Promise.all(promise_array);
                      }).then(ret => {
                
                        return get_number_of_rows_inserted();
                
                      }).then(n => {
                
                        console.log("numero inseriti: " + n[0].inserted);        
                
                        return resolve();
                
                      }).catch(function (err) {
                        console.error(err);
                        return reject(err);
                      });
                */
            });
    });
}

function crawl(opt) {

    let n_insertions = 0, this_insertion = null;

    opt.number_page_processed = 0;

    return promiseUntil(() => {

        console.log("opt.number_page_processed: " + opt.number_page_processed);

        return opt.number_page_processed >= opt.max_page_number;

    }, () => {

        let n_opt = Object.assign({}, opt);
        n_opt.uri = n_opt.uri + "&o=" + (n_opt.number_page_processed + 1);

        return rp(n_opt).then(function (ret) {

            // ottengo il nuemro di inserzioni totale.
            let $ = ret;
            let text = $("#advertiser_type_dropdown_button").text();
            let n_adv = text.match(/\d+/);
            if (n_adv.length > 0) {
                n_insertions = n_adv[0];
            }

            this_insertion = $;

            // ottenfo dal db la lista delle inserzioni salvate in precedenza
            return get_insertions_by_research_id(researches[opt.research_id].id);

        }).then(stored_insertions => {

            let promise_array = [];

            // devo ciclare la pagina, inserire le inserzioni nuove e modificare quelle già esistenti
            let $ = this_insertion;
            let new_ins_list = $("article.item_list.view_listing");

            // leggo tutte le inserzioni della pagina, estraggo le informazioni e le confronto con le precedenti
            // per verificare che siano uguali. Se differiscono aggiorno.
            new_ins_list.map((idx, v) => {
                let $ = cheerio.load(v);
                let data_id = $("article.item_list.view_listing").attr("data-id");
                let a = $("div.item_list_section.item_description").find("a");
                let url = a.attr("href");
                let description = a.text().trim();
                let price = $("div.item_list_section.item_description").find("span.item_price").text().trim();
                let location = $("span.item_info.item_info_motori").find("span.item_location").text().trim();
                let extras = $("div.item_extra_data").find("li");
                let extras_values = [];
                for (let j = 0; j < extras.length; ++j) {
                    let val = $(extras[j]).text().trim();
                    if (val)
                        extras_values.push(val);
                }

                let ins_obj = {
                    id_research: researches[opt.research_id].id,
                    data_id: data_id,
                    url: url,
                    description: description,
                    price: price,
                    location: location,
                    extras: JSON.stringify(extras_values)
                };

                if (!all_insertions_inserted[opt.research_id]) {
                    all_insertions_inserted[opt.research_id] = [];
                }

                if (!all_insertions_updated[opt.research_id]) {
                    all_insertions_updated[opt.research_id] = [];
                }

                if (!stored_insertions || !stored_insertions.length) {

                    all_insertions_inserted[opt.research_id].push(ins_obj);
                    promise_array.push(insert_insertion_or_update(ins_obj));

                } else {

                    let insert = null;
                    // super velocità ???
                    let j = 0; const iMax = stored_insertions.length;
                    for (; j < iMax; j++) {
                        if (stored_insertions[j].data_id == data_id) {
                            insert = stored_insertions[j];
                            break;
                        }
                    }

                    if (!insert) {

                        all_insertions_inserted[opt.research_id].push(ins_obj);
                        promise_array.push(insert_insertion_or_update(ins_obj));

                    } else if (insert && (
                        insert.url != url ||
                        insert.description != description ||
                        insert.price != price ||
                        insert.location != location
                    )) {
                        all_insertions_updated[opt.research_id].push(ins_obj);
                        promise_array.push(insert_insertion_or_update(ins_obj));
                    }
                }
            });

            return Promise.all(promise_array);

        }).then(ret => {

            opt.number_page_processed++;

        }).catch(function (err) {
            log.error(err);
            return reject(err);
        });
    });
}

function get_insertions_by_research_id(id) {
    return new Promise((resolve, reject) => {
        let sql_urls = `select * from insertions
    where id_research = ` + id;

        db.all(sql_urls, [], (err, rows) => {
            if (err) {
                return reject(err);
            }
            return resolve(rows);
        });
    });
}

function insert_insertion_or_update(ins_obj) {
    return new Promise((resolve, reject) => {
        // let ins_obj = {
        //   id_research: researches[i],
        //   data_id: data_id,
        //   url: url,
        //   description: description,
        //   price: price,
        //   location: location,
        //   extras: JSON.stringify(extras_values)
        // };

        //db.serialize(function () {
        let sql_urls = `INSERT OR REPLACE into insertions (id_research, data_id, url, description, price, location, extras, updated_at)
    values(?,?,?,?,?,?,?,?)`;

        db.run(sql_urls, [
            ins_obj.id_research,
            ins_obj.data_id,
            ins_obj.url,
            ins_obj.description,
            ins_obj.price,
            ins_obj.location,
            ins_obj.extras,
            now
        ], (err, rows, bo) => {
            if (err) {
                return resolve(err);
            }
            return resolve();

        });

        // db.all("SELECT last_insert_rowid();", (err, rows) => {
        //   if (err) {
        //     return reject(err);
        //   }
        //   return resolve(rows);
        // });

        //});
    });
}

function get_number_of_rows_inserted() {
    return new Promise((resolve, reject) => {
        db.all("select total_changes() as changes", (err, rows) => {
            if (err) {
                return reject(err);
            }
            return resolve(rows);
        });
    });
}



//******************************************* */

function create_table_researches() {
    return new Promise((resolve) => {
        let sql = `CREATE TABLE IF NOT EXISTS researches (
    id_research integer primary key,
    url text,
    name text
   )`;

        db.run(sql, [], (err, rows) => {
            if (err) {
                throw err;
            }
            resolve();
        });
    });
}
function create_table_insertions() {
    return new Promise((resolve) => {

        try {
            db.serialize(function () {
                let sql_urls = `CREATE TABLE IF NOT EXISTS insertions (
    id integer PRIMARY KEY,
    id_research integer not null, 
    data_id text,
    url text,
    description text,
    price text,
    location text,
    extras text,
    updated_at	integer
   )`;

                db.run(sql_urls);
                db.run("CREATE UNIQUE INDEX IF NOT EXISTS index_data_id ON insertions(data_id)");

                resolve();

            });

        } catch (err) {
            log.error(err);
        }

    });


}