"use strict";

const now = new Date().getTime();

const rp = require('request-promise');
const cheerio = require('cheerio');

const db_manager = require("./db_manager");
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

var researches = null;
var all_insertions_inserted = {};
var all_insertions_updated = {};

module.exports.start = function (researchers_list) {

    researches = Object.assign({}, researchers_list);

    init().then(() => {
        return main();
    }).catch(err => {
        log.error(err);
    }).then(() => {

        return db_manager.close();

    }).then(() => {

        print_report();

        log.info("Fine");

    }).catch(err => {
        log.error(err);
    });
}

function print_report() {

    let inserts = {};
    for (let i in all_insertions_inserted) {
        for (let k = 0; k < all_insertions_inserted[i].length; ++k) {

            let sub_insert = "";
            let recipient = "";

            for (let l in all_insertions_inserted[i][k]) {
                if (l == 'id_research') {

                    // if (!inserts[researches[all_insertions_inserted[i][k][l]]]) {
                    //     inserts[researches[all_insertions_inserted[i][k][l]]] = "";
                    // }
                    recipient = researches[all_insertions_inserted[i][k][l]].recipient;

                    sub_insert += "<tr style='background-color:yellow;'><td>" + l + "</td>";
                    sub_insert += "<td>" + researches[all_insertions_inserted[i][k][l]].name + "</td></tr>";
                } else {
                    sub_insert += "<tr><td>" + l + "</td>";
                    sub_insert += "<td>" + all_insertions_inserted[i][k][l] + "</td></tr>";
                }
            }

            if (!inserts[recipient]) {
                inserts[recipient] = "";
            }
            inserts[recipient] += sub_insert;
        }
    }

    let updates = {};
    for (let i in all_insertions_updated) {
        for (let k = 0; k < all_insertions_updated[i].length; ++k) {

            let sub_updates = "";
            let recipient = "";

            for (let l in all_insertions_updated[i][k]) {
                if (l == 'id_research') {

                    // if (!updates[researches[all_insertions_updated[i][k][l]]]) {
                    //     updates[researches[all_insertions_updated[i][k][l]]] = "";
                    // }
                    recipient = researches[all_insertions_updated[i][k][l]].recipient;

                    sub_updates += "<tr style='background-color:yellow;'><td>" + l + "</td>";
                    sub_updates += "<td>" + researches[all_insertions_updated[i][k][l]].name + "</td></tr>";
                } else {
                    sub_updates += "<tr><td>" + l + "</td>";
                    sub_updates += "<td>" + all_insertions_updated[i][k][l] + "</td></tr>";
                }
            }

            if (!updates[recipient]) {
                updates[recipient] = "";
            }
            updates[recipient] += sub_updates;
        }
    }

    if (Object.keys(inserts).length > 0 || Object.keys(updates).length > 0) {

        let tables = {};
        for (let k in inserts) {

            if (!tables[k]) {
                tables[k] = { inserts: "" };
            }
            if (!tables[k].inserts) {
                tables[k].inserts = "";
            }

            tables[k].inserts += "<table style='border: 1px solid black' border='1'>";
            tables[k].inserts += "<tr><th colspan='2'>Nuovi Inserimenti:</th>";
            tables[k].inserts += inserts[k];
            tables[k].inserts += "</table>";
        }

        for (let k in updates) {

            if (!tables[k]) {
                tables[k] = { updates: "" };
            }
            if (!tables[k].updates) {
                tables[k].updates = "";
            }

            tables[k].updates += "<table style='border: 1px solid black' border='1'>";
            tables[k].updates += "<tr><th colspan='2'>Aggiornamenti:</th>";
            tables[k].updates += updates[k];
            tables[k].updates += "</table>";
        }

        for (let k in tables) {

            let report = (tables[k].inserts || "") + "<br />" + (tables[k].updates || "");

            let mails_splitted = k.split(",");
            for (let m = 0; m < mails_splitted.length; ++m) {
                log.info("invio email a: " + mails_splitted[m]);
                mail.send_mail(mails_splitted[m], 'report', "", report).then(ret => {
                    log.info("mail inviata");
                }).catch(err => {
                    console.error(err);
                    log.error("errore invio email: " + JSON.stringify(err));
                });
            }
        }
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
// function init() {
//     return new Promise((resolve, reject) => {
//         db = new sqlite3.Database('./urls.db', (err) => {
//             if (err) {
//                 log.error(err.message);
//                 throw err;
//             }
//             console.log('Connected to the urls database.');

//             create_table_insertions()
//                 // .then(() => {
//                 //   return create_table_researches();
//                 // })
//                 .then(() => {
//                     resolve();
//                 }).catch((err) => {
//                     reject(err);
//                 });
//         });
//     });
// }

async function init() {
    await db_manager.create_db();
    return db_manager.create_table_insertions();
}

//******************************************* */

function main() {
    //return new Promise((resolve, reject) => {
    // TODO: mettere paginazione con controlli
    let options = [];
    for (let i in researches) {
        options.push({
            research_id: i,
            uri: researches[i].url,
            transform: function (body) {
                return cheerio.load(body);
            }
        });
    }

    return Promise.all(options.map(o => { return rp(o); }))
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

            return Promise.all(options.map(crawl));

            // }).then(ret => {
            //     return get_number_of_rows_inserted();
        }).then(n => {
            //log.info("numero modifiche: " + n[0].changes);
            return;
        }).catch(err => {
            throw err;
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
            return db_manager.get_insertions_by_research_id(researches[opt.research_id].id);

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
                    extras: JSON.stringify(extras_values),
                    updated_at: now
                };

                if (!all_insertions_inserted[opt.research_id]) {
                    all_insertions_inserted[opt.research_id] = [];
                }

                if (!all_insertions_updated[opt.research_id]) {
                    all_insertions_updated[opt.research_id] = [];
                }

                if (!stored_insertions || !stored_insertions.length) {
                    all_insertions_inserted[opt.research_id].push(ins_obj);
                    promise_array.push(db_manager.insert_insertion_or_update(ins_obj));

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
                        promise_array.push(db_manager.insert_insertion_or_update(ins_obj));

                    } else if (insert && (
                        insert.url != url ||
                        insert.description != description ||
                        insert.price != price ||
                        insert.location != location
                    )) {
                        all_insertions_updated[opt.research_id].push(ins_obj);
                        promise_array.push(db_manager.insert_insertion_or_update(ins_obj));
                    }
                }
            });

            return Promise.all(promise_array);

        }).then(ret => {

            opt.number_page_processed++;

        }).catch(function (err) {
            log.error(err);
            throw err;
        });
    });
}

// function get_insertions_by_research_id(id) {
//     return new Promise((resolve, reject) => {
//         let sql_urls = `select * from insertions
//     where id_research = ` + id;

//         db.all(sql_urls, [], (err, rows) => {
//             if (err) {
//                 return reject(err);
//             }
//             return resolve(rows);
//         });
//     });
// }

// function insert_insertion_or_update(ins_obj) {
//     return new Promise((resolve, reject) => {
//         // let ins_obj = {
//         //   id_research: researches[i],
//         //   data_id: data_id,
//         //   url: url,
//         //   description: description,
//         //   price: price,
//         //   location: location,
//         //   extras: JSON.stringify(extras_values)
//         // };

//         //db.serialize(function () {
//         let sql_urls = `INSERT OR REPLACE into insertions (id_research, data_id, url, description, price, location, extras, updated_at)
//     values(?,?,?,?,?,?,?,?)`;

//         db.run(sql_urls, [
//             ins_obj.id_research,
//             ins_obj.data_id,
//             ins_obj.url,
//             ins_obj.description,
//             ins_obj.price,
//             ins_obj.location,
//             ins_obj.extras,
//             now
//         ], (err, rows, bo) => {
//             if (err) {
//                 return resolve(err);
//             }
//             return resolve();

//         });

//         // db.all("SELECT last_insert_rowid();", (err, rows) => {
//         //   if (err) {
//         //     return reject(err);
//         //   }
//         //   return resolve(rows);
//         // });

//         //});
//     });
// }

// function get_number_of_rows_inserted() {
//     return Promise.resolve(55);


//     return new Promise((resolve, reject) => {
//         db.all("select total_changes() as changes", (err, rows) => {
//             if (err) {
//                 return reject(err);
//             }
//             return resolve(rows);
//         });
//     });
// }



//******************************************* */

// function create_table_researches() {
//     return new Promise((resolve) => {
//         let sql = `CREATE TABLE IF NOT EXISTS researches (
//     id_research integer primary key,
//     url text,
//     name text
//    )`;

//         db.run(sql, [], (err, rows) => {
//             if (err) {
//                 throw err;
//             }
//             resolve();
//         });
//     });
// }
// function create_table_insertions() {
//     return new Promise((resolve) => {

//         try {
//             db.serialize(function () {
//                 let sql_urls = `CREATE TABLE IF NOT EXISTS insertions (
//     id integer PRIMARY KEY,
//     id_research integer not null, 
//     data_id text,
//     url text,
//     description text,
//     price text,
//     location text,
//     extras text,
//     updated_at	integer
//    )`;

//                 db.run(sql_urls);
//                 db.run("CREATE UNIQUE INDEX IF NOT EXISTS index_data_id ON insertions(data_id)");

//                 resolve();

//             });

//         } catch (err) {
//             log.error(err);
//         }

//     });

//     });

// }
