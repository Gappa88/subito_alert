// using SendGrid's v3 Node.js Library
// https://github.com/sendgrid/sendgrid-nodejs
const sgMail = require('@sendgrid/mail');
//sgMail.setApiKey(process.env.SENDGRID_API_KEY);
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