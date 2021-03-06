"use strict";
const promiseUntil = require('promise-until');
const rp = require('request-promise');
const cheerio = require('cheerio');
var log = null;
//var db_manager_class = require("./db_manager");
var mail = require('./send_mail.js');

module.exports = class MotoScraper {
    constructor(_log, db_m, db) {
        this.now = new Date().getTime();
        //this.db_manager = new db_manager_class();
        this.db_manager = db_m;
        this.db_conn = db;
        this.url_parser = require('url');

        log = _log;

        this.researches = null;
        this.all_insertions_inserted = {};
        this.all_insertions_updated = {};
        //this.db_conn = null;
    }

    async start(researchers_list) {
        this.researches = Object.assign({}, researchers_list);
        //await this.init();
        while (true) {
            try {
                console.log(`Start reasearch: ${this.researches.name}`);
                log.info(`Start reasearch: ${this.researches.name}`);
                await this.main();
                this.print_report();
                log.info(`Fine reasearch: ${this.researches.name}`);
                console.log(`Fine reasearch: ${this.researches.name}`);

                await this.sleep(this.researches.insertions_interval_checker_seconds * 1);

            } catch (err) {
                console.log(err);
            }
        }
        await this.db_manager.close(this.db_conn); 
        this.db_conn = null;               
    }

    async sleep(ms) {
        return new Promise(r => { setTimeout(r, ms) });
    }

    //******************************************* */
    // controllo presenza tabelle

    // async init() {
    //     this.db_conn = await this.db_manager.create_db();
    //     return this.db_manager.create_table_insertions(this.db_conn);
    // }

    //******************************************* */

    main() {
        let options = [];
        options.push({
            research_id: 0,
            uri: this.researches.url,
            transform: function (body) {
                return cheerio.load(body);
            }
        });

        return Promise.all(options.map(o => {
            return rp(o);
        }))
            .then(pages => {
                // for (let i = 0; i < pages.length; ++i) {
                //     options[i].max_page_number = 1;
                //     let $ = pages[i];                    
                //     let url = this.url_parser.parse(options[i].uri, true);
                //     if (url && url.query && url.query.size) {                        
                //         options[i].max_page_number = parseInt(url.query.size) || 1;
                //     }
                // }

                return options.reduce((promise, o, idx) => {
                    return promise.then(a => {
                        console.log(`eseguo chunk n. ${idx}`);
                        return this.crawl(o, this.db_manager, this.db_conn, this.researches);
                    }).catch(console.error);
                }, Promise.resolve());

                // return Promise.reduce(options.map(o => {
                //     return this.crawl(o, this.db_manager, this.db_conn, this.researches);
                // }));

            }).then(n => {
                //log.info("numero modifiche: " + n[0].changes);
                return;
            }).catch(err => {
                throw err;
            });
    }

    crawl(opt, db_manager, db_conn, researches) {
        let stop = false;
        let this_insertion = null;
        opt.number_page_processed = 0;

        return promiseUntil(() => {

            console.log("opt.number_page_processed: " + opt.number_page_processed);
            return stop;
        }, () => {

            let n_opt = Object.assign({}, opt);
            //n_opt.uri = n_opt.uri + "&o=" + (n_opt.number_page_processed + 1);
            let url_parts = this.url_parser.parse(n_opt.uri, true);
            delete url_parts.search;
            url_parts.query.page = n_opt.number_page_processed + 1;
            n_opt.uri = this.url_parser.format(url_parts);

            return rp(n_opt).then(function (ret) {

                // ottengo il numero di inserzioni totale.
                //let $ = ret;
                // let text = $("div.mit-title-wrap .titles").find("span.additional").text();
                // let n_adv = text.match(/\d+/);
                // if (n_adv && n_adv.length && n_adv.length > 0) {
                //     n_insertions = n_adv[0];
                // }

                //this_insertion = $;
                this_insertion = ret;

                // ottenfo dal db la lista delle inserzioni salvate in precedenza
                //return this.db_manager.get_insertions_by_research_id(db_conn, researches[opt.research_id].id);
                return db_manager.get_insertions_by_research_id(db_conn, researches.id);

            }).then(stored_insertions => {

                let promise_array = [];

                // devo ciclare la pagina, inserire le inserzioni nuove e modificare quelle già esistenti
                let $ = this_insertion;
                let new_ins_list = $("div.cl-list-elements div.cl-list-element.cl-list-element-gap");

                stop = new_ins_list.length == 0;

                // leggo tutte le inserzioni della pagina, estraggo le informazioni e le confronto con le precedenti
                // per verificare che siano uguali. Se differiscono aggiorno.
                new_ins_list.map((idx, v) => {

                    let $ = cheerio.load(v);
                    let ass = $(".cldt-summary-titles > a");
                    //if(!ass || as.length == 0) continue;                    
                    let url = "https://www.autoscout24.it" + ass[0].attribs.href;
                    let description = $(".cldt-summary-title").text().trim();
                    let price = $("span.cldt-price").text().trim().replace("-", "").replace(",", "");
                    let location = $("span.cldt-summary-seller-contact-zip-city").text().trim();
                    let extras_values = Array.from($(".cldt-summary-vehicle-data ul li")).map(o => o.childNodes[0].data.trim());

                    let ins_obj = {
                        id_research: researches.id,
                        url,
                        description,
                        price,
                        location,
                        extras: JSON.stringify(extras_values),
                        updated_at: this.now
                    };

                    if (!this.all_insertions_inserted[opt.research_id]) {
                        this.all_insertions_inserted[opt.research_id] = [];
                    }
                    if (!this.all_insertions_updated[opt.research_id]) {
                        this.all_insertions_updated[opt.research_id] = [];
                    }

                    if (!stored_insertions || !stored_insertions.length) {
                        this.all_insertions_inserted[opt.research_id].push(ins_obj);
                        promise_array.push(db_manager.insert_insertion_or_update(db_conn, ins_obj));

                    } else {
                        let insert = null;
                        // super velocità ???
                        let j = 0; const iMax = stored_insertions.length;
                        for (; j < iMax; j++) {
                            if (stored_insertions[j].url == url) {
                                insert = stored_insertions[j];
                                stored_insertions[j].done = true;
                                break;
                            }
                        }

                        if (!insert) {

                            this.all_insertions_inserted[opt.research_id].push(ins_obj);
                            promise_array.push(db_manager.insert_insertion_or_update(db_conn, ins_obj));

                        } else if (insert && (
                            insert.url != url ||
                            insert.description != description ||
                            insert.price != price ||
                            insert.location != location
                        )) {
                            this.all_insertions_updated[opt.research_id].push(ins_obj);
                            promise_array.push(db_manager.insert_insertion_or_update(db_conn, ins_obj));
                        }
                    }
                });

                let j = 0; const iMax = stored_insertions.length;
                for (; j < iMax; j++) {
                    if (!stored_insertions[j].done) {
                        //promise_array.push(db_manager.delete_insertion_by_id(db_conn, stored_insertions[j].id));
                    }
                }

                return Promise.all(promise_array);

            }).then(ret => {

                opt.number_page_processed++;

            }).catch(function (err) {
                console.error(researches);
                log.error(err);
                throw err;
            });
        });
    }

    print_report() {

        let inserts = {};
        for (let i in this.all_insertions_inserted) {
            for (let k = 0; k < this.all_insertions_inserted[i].length; ++k) {

                let sub_insert = "";
                let recipient = "";

                for (let l in this.all_insertions_inserted[i][k]) {
                    if (l == 'id_research') {

                        //recipient = this.researches[this.all_insertions_inserted[i][k][l]].mail_recipients;
                        recipient = this.researches.mail_recipients;

                        sub_insert += "<tr style='background-color:yellow;'><td>" + l + "</td>";
                        //sub_insert += "<td>" + this.researches[this.all_insertions_inserted[i][k][l]].name + "</td></tr>";
                        sub_insert += "<td>" + this.researches.name + "</td></tr>";
                    } else {
                        sub_insert += "<tr><td>" + l + "</td>";
                        sub_insert += "<td>" + this.all_insertions_inserted[i][k][l] + "</td></tr>";
                    }
                }

                if (!inserts[recipient]) {
                    inserts[recipient] = "";
                }
                inserts[recipient] += sub_insert;
            }
        }

        let updates = {};
        for (let i in this.all_insertions_updated) {
            for (let k = 0; k < this.all_insertions_updated[i].length; ++k) {

                let sub_updates = "";
                let recipient = "";

                for (let l in this.all_insertions_updated[i][k]) {
                    if (l == 'id_research') {

                        //recipient = this.researches[this.all_insertions_updated[i][k][l]].recipient;
                        recipient = this.researches.mail_recipients;

                        sub_updates += "<tr style='background-color:yellow;'><td>" + l + "</td>";
                        //sub_updates += "<td>" + this.researches[this.all_insertions_updated[i][k][l]].name + "</td></tr>";
                        sub_updates += "<td>" + this.researches.name + "</td></tr>";
                    } else {
                        sub_updates += "<tr><td>" + l + "</td>";
                        sub_updates += "<td>" + this.all_insertions_updated[i][k][l] + "</td></tr>";
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

            console.log(`ricerca: ${this.researches.name} => inseriti: ${Object.keys(inserts).length}`);
            console.log(`ricerca: ${this.researches.name} => aggiornati: ${Object.keys(updates).length}`);
            log.info(`ricerca: ${this.researches.name} => inseriti: ${Object.keys(inserts).length}`);
            log.info(`ricerca: ${this.researches.name} => aggiornati: ${Object.keys(updates).length}`);

            for (let k in tables) {

                let report = (tables[k].inserts || "") + "<br />" + (tables[k].updates || "");

                if (this.researches.send_email) {
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
        }

        for (let k in this.all_insertions_inserted) {
            if (this.all_insertions_inserted[k] instanceof Array) {
                this.all_insertions_inserted[k].length = 0;
                this.all_insertions_inserted[k] = null;
            }
            delete this.all_insertions_inserted[k];
        }
        this.all_insertions_inserted = null;
        this.all_insertions_inserted = {};

        for (let k in this.all_insertions_updated) {
            if (this.all_insertions_updated[k] instanceof Array) {
                this.all_insertions_updated[k].length = 0;
                this.all_insertions_updated[k] = null;
            }
            delete this.all_insertions_updated[k];
        }
        this.all_insertions_updated = null;
        this.all_insertions_updated = {};
    }
}