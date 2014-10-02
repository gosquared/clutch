/**
 * Process management logic for both master and workers.
 */

var cluster      = require('cluster');
var util         = require('util');
var os           = require('os');
var EventEmitter = require('events').EventEmitter;
var log          = console.log;
var createWorker = require('./Worker');
var clutch;

var Clutch = function(opts){
  var self = this;
  EventEmitter.call(this);
  self.opts = {
    numWorkers: os.cpus().length,
    name: 'server',
    nameProcess: true,
    log: false,
    forceExitTimeout: 7500
  };

  if(typeof opts == 'object'){
    for(var i in opts){
      self.opts[i] = opts[i];
    }
  }

  log = (typeof self.opts.log == 'function' && self.opts.log) || (self.opts.log && log) || function(){};
  self.title = '';
  self.shuttingDown = false;

  if(!self.opts.numWorkers){
    self.title = self.opts.name;
  }else{
    self.title = self.opts.name + ': ' + (cluster.isMaster ? 'master' : 'worker') + ' process';
  }

  this.setProcessTitle(self.title);

  // Listen to interrupt signals on both master and worker processes
  this.catchSignals(['SIGHUP', 'SIGINT', 'SIGTERM']);
  this.setupIPC();
  if(cluster.isMaster) this.startCluster();
};

util.inherits(Clutch, EventEmitter);

/**
 * Bind handlers to Inter Process Communication messages
 */
Clutch.prototype.setupIPC = function() {
  var self = this;

  if(cluster.isWorker){
    process.on('message', function(msg){
      switch(msg){
        case 'shutDown':
          self.shutDown();
          break;
      }
    });
  }
};

Clutch.prototype.setProcessTitle = function(title) {
  if(!this.opts.nameProcess) return;

  process.title = title;
};

/**
 * Spawn required number of workers
 * @param  {Function} cb - Run when first worker is listening and ready to accept connections
 */
Clutch.prototype.startCluster = function(cb){
  var self = this;
  if(!cb) cb = function(){};

  if(!this.opts.numWorkers) return cb();

  for(var i = 0; i < this.opts.numWorkers; i += 1){
    self.startWorker();
  }

  setInterval(function(){
    self.setProcessTitle(self.title + ' [numworkers: ' + self.countWorkers() + ']');
  }, 1000);

  // Fire the callback as soon as at least one worker is ready to receive traffic
  cluster.once('listening', function(){
    self.emit('listening');
    return cb();
  });
};

Clutch.prototype.startWorker = function(){
  var self = this;

  var worker = createWorker({
    log: log
  });

  log('Worker started');

  self.emit('workerStarted');

  worker.on('listening', function() {
    self.setProcessTitle(self.title + ' <listening>');
  });

  worker.once('exit', function(){

    // If worker hasn't been told to kill itself then it died unexpectedly beyond our control
    if(!worker.control.suicide && !self.shuttingDown){
      log('worker died unexpectedly');
      self.workerDied(worker);
    } else {
      self.emit('workerExit');
    }

    if(self.countWorkers() === 0) return self.emit('noWorkers');
  });
};

Clutch.prototype.countWorkers = function() {
  return Object.keys(cluster.workers).length;
};

Clutch.prototype.eachWorker = function(cb) {
  for(var i in cluster.workers){
    var worker = cluster.workers[i];
    cb(worker);
  }
};

Clutch.prototype.workerDied = function(worker){
  var self = this;
  self.emit('workerDied', worker);

  // Ensure the worker process is killed
  worker.control.kill();

  // Start a new worker
  this.startWorker();
};

Clutch.prototype.shutDown = function(){
  var self = this;
  if(self.shuttingDown) return;

  self.shuttingDown = true;
  self.setProcessTitle(self.title + ' <shutting down>');

  // In case the external application doesn't exit the process
  setTimeout(function(){
    log('forcing shutdown');
    process.exit();
  }, self.opts.forceExitTimeout);

  if(cluster.isMaster){

    // If no workers are active then we're ready to shut down immediately
    if(!self.opts.numWorkers || !self.countWorkers()) return self.emit('shutDown');

    self.once('noWorkers', function(){
      self.emit('shutDown');
    });

    // signal all workers to shut down
    log('shutting down workers');

    return self.eachWorker(function(worker){
      worker.send('shutDown');
    });
  }

  // Workers only
  self.emit('shutDown');
};

/**
 * Intercept process signals
 * @param  {array} signals - List of signals to listen out for
 */
Clutch.prototype.catchSignals = function(signals) {
  var self = this;

  signals.forEach(function(signal){
    process.once(signal, function(){
      log('caught signal ' + signal);

      // Do nothing on worker and let master control shutdowns
      if(cluster.isMaster) self.shutDown();
    });
  });
};

module.exports = function(opts){
  // Instantiate a single instance
  if(!clutch) clutch = new Clutch(opts);
  return clutch;
};
