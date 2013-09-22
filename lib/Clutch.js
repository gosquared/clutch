var cluster = require('cluster');
var util = require('util');
var os = require('os');
var EventEmitter = require('events').EventEmitter;
var log = console.log;
var clutch;

var Clutch = function(opts){
  var self = this;
  EventEmitter.call(this);
  self.opts = {
    numWorkers: os.cpus().length,
    name: 'server',
    nameProcess: true
  };

  if(typeof opts == 'object'){
    for(var i in opts){
      self.opts[i] = opts[i];
    }
  }

  self.title = '';
  self.shuttingDown = false;

  if(!opts.numWorkers){
    self.title = self.opts.name;
  }else{
    self.title = self.opts.name + ': ' + (cluster.isMaster ? 'master' : 'worker') + ' process';
  }

  this.setProcessTitle(self.title);
  // Listen to interrupt signals on both master and worker processes
  this.catchSignals(['SIGHUP', 'SIGINT', 'SIGTERM']);
  this.setupIPC();
  this.setupBeacon();
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

/**
 * Worker health beacon. Periodically pings the master to prove it is still alive
 */
Clutch.prototype.setupBeacon = function(){
  if(cluster.isMaster) return;

  // start sending health beacons to the master
  this.beaconInterval = setInterval(function(){
    process.send('stillalive');
  }, 100);

  this.setProcessTitle(this.title + ' <listening>');
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
    self.setProcessTitle(self.title + ' [running workers: ' + self.countWorkers() + ']');
  }, 1000);

  // Fire the callback as soon as at least one worker is ready to receive traffic
  cluster.once('listening', function(){
    return cb();
  });
};

Clutch.prototype.startWorker = function(){
  var self = this;

  var worker = cluster.fork();

  log('Worker started');

  // Listen for health beacons and all that jazz. Include respawning logic
  worker.once('listening', function(){
    self.startCheckingWorker(worker);
  });

  worker.on('message', function(msg){
    switch(msg){
      case 'stillalive':
        worker.fails = 0;
        break;
    }
  });

  worker.on('exit', function(code, signal){
    log("worker exit code " + code);

    // If worker hasn't been told to kill itself then it died unexpectedly beyond our control
    if(!worker.suicide && !self.shuttingDown){
      log('worker died unexpectedly');
      self.workerDied(worker);
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

Clutch.prototype.startCheckingWorker = function(worker){
  var self = this;
  worker.fails = 0;
  worker.checkInterval = setInterval(function(){
    if(self.shuttingDown) return;
    worker.fails++;
    if(worker.fails > 5){
      if(!worker.shouldBeShuttingDown){
        self.workerDied(worker);
      }
    }
  }, 200);
};

Clutch.prototype.workerDied = function(worker){
  // Ensure the worker process is killed
  this.shutDownWorker(worker);

  // Start a new worker
  this.startWorker();
};

Clutch.prototype.shutDownWorker = function(worker){
  worker.shouldBeShuttingDown = true;

  try{
    worker.send('shutDown');

    // In case worker is stuck, send a kill
    setTimeout(function(){
      worker.kill('SIGKILL');
    }, 5000);
  }
  catch(e){}
};

Clutch.prototype.shutDown = function(){

  var self = this;
  if(self.shuttingDown) return;

  self.shuttingDown = true;
  self.setProcessTitle(self.title + ' <shutting down>');

  if(cluster.isMaster){
    // In case workers don't gracefully quit
    setTimeout(function(){
      log('forcing shutdown');
      self.emit('shutDown');
    }, 7500);

    if(!self.opts.numWorkers || !self.countWorkers()) return self.emit('shutDown');

    self.once('noWorkers', function(){
      self.emit('shutDown');
    });

    // signal all workers to shut down
    console.log('shutting down workers');

    return self.eachWorker(function(worker){
      self.shutDownWorker(worker);
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
    process.on(signal, function(){
      log('caught signal ' + signal);

      if(cluster.isMaster) self.shutDown();
    });
  });
};

module.exports = function(opts){
  // Instantiate a single instance
  if(!clutch) clutch = new Clutch(opts);
  return clutch;
};
