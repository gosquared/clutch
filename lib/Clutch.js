var cluster = require('cluster');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var log = console.log;

var Clutch = function(opts){
  var self = this;
  EventEmitter.call(this);
  self.opts = {
    numWorkers: 2,
    name: 'server'
  };

  for(var i in opts){
    self.opts[i] = opts[i];
  }

  self.title = '';
  self.shuttingDown = false;

  if(!opts.useCluster){
    self.title = self.opts.name;
  }else{
    self.title = self.opts.name + ': ' + (cluster.isMaster ? 'master' : 'worker') + ' process';
  }

  process.title = self.title;
  this.catchSignals(['SIGHUP', 'SIGINT', 'SIGTERM']);
  this.setupIPC();
  this.setupBeacon();
  if(cluster.isMaster) this.startCluster();
};

util.inherits(Clutch, EventEmitter);

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

Clutch.prototype.setupBeacon = function(){

  if(cluster.isWorker){
    // start sending health beacons to the master
    this.beaconInterval = setInterval(function(){
      process.send('stillalive');
    }, 100);

    process.title = this.title + ' <listening>';
  }
};

Clutch.prototype.requestOpened = function() {
  this.openRequests += 1;
};

Clutch.prototype.requestClosed = function() {
  this.openRequests -= 1;
};

Clutch.prototype.startCluster = function(cb){
  var self = this;
  if(!cb) cb = function(){};

  if(!this.opts.numWorkers) return cb();

  for(var i = 0; i < this.opts.numWorkers; i += 1){
    self.startWorker();
  }

  setInterval(function(){
    process.title = self.title + ' [running workers: ' + self.countWorkers() + ']';
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

    setTimeout(function(){
      worker.kill('SIGINT');
    }, 5000);

    // In case worker is stuck, send a kill
    setTimeout(function(){
      worker.kill('SIGKILL');
    }, 7500);
  }
  catch(e){}
};

Clutch.prototype.shutDown = function(){

  var self = this;
  if(self.shuttingDown) return;

  self.shuttingDown = true;
  process.title = self.title + ' <shutting down>';

  if(cluster.isMaster){
    // In case workers don't gracefully quit
    setTimeout(function(){
      log('forcing shutdown');
      self.emit('shutDown');
    }, 10000);

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
  return new Clutch(opts);
};
