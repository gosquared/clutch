/**
 * Worker management logic for master process.
 */

var EventEmitter = require('events').EventEmitter;
var util         = require('util');
var cluster      = require('cluster');

var log = console.log;

var Worker = module.exports = function(control, opts) {
  var self = this;
  EventEmitter.call(self);

  self.opts = opts;

  self.control = control;
  log = (typeof self.opts.log == 'function' && self.opts.log) || (self.opts.log && log) || function(){};
  self.watch();
};

util.inherits(Worker, EventEmitter);

Worker.prototype.watch = function() {
  var self = this;

  var events = ['message', 'online', 'listening', 'disconnect', 'error', 'exit'];
  for (var i = 0; i < events.length; i++) {
    var name = events[i];
    self.control.on(name, self.emit.bind(self, name));
  }
};

module.exports = function createWorker(opts) {
  var conf = {};

  for (var p in opts) {
    if (opts.hasOwnProperty(p)) {
      conf[p] = opts[p];
    }
  }

  var control = cluster.fork();
  return new Worker(control, conf);
};
