const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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

