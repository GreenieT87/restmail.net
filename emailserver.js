#!/usr/bin/env node

var smtp = require('smtp-protocol'),
   redis = require("redis"),
   MailParser = require("mailparser").MailParser,
   config = require("./config"),
   util = require('util');

const HOSTNAME = process.env.EMAIL_HOSTNAME || "restmail.net";
const IS_TEST = process.env.NODE_ENV === 'test';

// create a connection to the redis datastore
var db = redis.createClient();

function log(/* format, values... */) {
  if (IS_TEST) return;
  var args = Array.prototype.slice.call(arguments);
  var timestamp = new Date().toISOString();
  args[0] = util.format('[%s] %s', timestamp, args[0]);
  process.stderr.write(util.format.apply(null, args) + '\n');
}

function logError(err) {
  log("ERROR (oh noes!): " + err);
}

var server = smtp.createServer(HOSTNAME, function (req) {
  log('Handling SMTP request');

  var users = [];

  req.on('to', function(user, ack) {
    users.push(user)
    ack.accept(250, "OK");
  })

  req.on('message', function (stream, ack) {
    var mailparser = new MailParser({
      streamAttachments: true
    });

    stream.pipe(mailparser);

    mailparser.on('end', (function(users, mail) {
      mail.receivedAt = new Date().toISOString();
      log('Received message for', users, mail);
      users.forEach(function(user) {
        db.rpush(user, JSON.stringify(mail), function(err) {
          if (err) return logError(err);

          if (config.expireAfter) {
            db.expire(user, config.expireAfter);
          }

          db.llen(user, function(err, replies) {
            if (err) return logError(err);

            if (replies > 10) db.ltrim(user, -10, -1, function(err) {
              if (err) return logError(err);
            });
          });
        });
      });
    }).bind(null, users));

    ack.accept(354, 'OK');
    users = []
  });
});

// handle starting from the command line or the test harness
if (process.argv[1] === __filename) {
  var port = process.env.PORT || 9025;
  log('Starting up on port', port);
  server.listen(port);
} else {
  module.exports = function(cb) {
    server.listen(0, function(err) {
      cb(err, server.address().port);
    });
  };
}
