const { Client } = require('pg');
const sqlite3 = require('sqlite3').verbose();

const db = new Client({
    connectionString: process.env.DATABASE_URL || "postgres://ruyplakbvjkdux:79516eb0766d30ca2ac0d07be1572f719118cafd1b4730021cfb35fea0e7ec30@ec2-54-163-240-54.compute-1.amazonaws.com:5432/d6fd4b5lqektn",
    ssl: true,
});

async function close() {
    //db.close();
    return db.end();
}


// controllo presenza tabelle
// function create_db() {
//     return new Promise((resolve, reject) => {
//         let db = new sqlite3.Database('./urls.db', (err) => {
//             if (err) {
//                 return reject(err);
//             }
//             console.log('Connected to the urls database.');
//             return resolve(db);
//         });
//     });
// }
async function create_db() {
    return db.connect();
}

// function create_table_insertions() {
//     return new Promise((resolve) => {
//         try {
//             db.serialize(function () {
//                 let sql_urls = `CREATE TABLE IF NOT EXISTS insertions (
//                     id integer PRIMARY KEY,
//                     id_research integer not null, 
//                     data_id text,
//                     url text,
//                     description text,
//                     price text,
//                     location text,
//                     extras text,
//                     updated_at	integer
//                 )`;
//                 db.run(sql_urls);
//                 db.run("CREATE UNIQUE INDEX IF NOT EXISTS index_data_id ON insertions(data_id)");
//                 return resolve();
//             });
//         } catch (err) {
//             log.error(err);
//         }
//     });
// }
function create_table_insertions() {
    let sql_urls = `CREATE TABLE IF NOT EXISTS insertions (
        id serial PRIMARY KEY,
        id_research integer not null, 
        data_id text,
        url text,
        description text,
        price text,
        location text,
        extras text,
        updated_at bigint
       ); 
       CREATE UNIQUE INDEX IF NOT EXISTS index_data_id ON insertions(data_id)`;

    return db.query(sql_urls);
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

async function get_insertions_by_research_id(id) {
    let sql_urls = `select * from insertions where id_research = ` + id;
    let rows = await db.query(sql_urls);
    return rows.rows;
}


// function insert_insertion_or_update(ins_obj) {
//     return new Promise((resolve, reject) => {        
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
//     });
// }
async function insert_insertion_or_update(ins_obj) {
    let sql_urls = `INSERT into insertions (id_research, data_id, url, description, price, location, extras, updated_at)
    values($1,$2,$3::text,$4::text,$5::text,$6::text,$7::text,$8)
    on conflict(data_id)
    DO UPDATE SET 
    url = $3::text, 
    description = $4::text, 
    price = $5::text,
    location = $6::text,
    extras = $7::text,
    updated_at = $8
    where insertions.data_id = $2
    `;

    //try {
        //let aa = await
         return db.query(sql_urls, [
            ins_obj.id_research,
            ins_obj.data_id,
            ins_obj.url,
            ins_obj.description,
            ins_obj.price,
            ins_obj.location,
            ins_obj.extras,
            ins_obj.updated_at
        ]);
    // } catch (err) {
    //     console.log(err);
    //     console.log(ins_obj);
    //     console.log(sql_urls);
    // }
}

module.exports = {
    create_db: create_db,
    create_table_insertions: create_table_insertions,
    get_insertions_by_research_id: get_insertions_by_research_id,
    insert_insertion_or_update: insert_insertion_or_update,
    close: close
};