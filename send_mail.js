const sgMail = require('@sendgrid/mail');

module.exports.send_mail = function (to, subject, body, html) {
    const msg = {
        to: to,
        from: 'report@myscraper.it',
        subject: subject,
        text: "boo",
        html: html,
    };

    return sgMail.send(msg);
}
