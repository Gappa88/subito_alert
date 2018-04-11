// using SendGrid's v3 Node.js Library
// https://github.com/sendgrid/sendgrid-nodejs
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey('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');

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
