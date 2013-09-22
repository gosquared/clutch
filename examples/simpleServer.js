var http = require('http');
var Clutch = require('../lib/Clutch');
var os = require('os');
var cluster = require('cluster');
var clutch = Clutch({
  numWorkers: os.cpus().length
});

if(cluster.isWorker){
  var server = http.createServer(function(req, res){
    res.end('Worker: ' + cluster.worker.id);
  }).listen(5000);
}

// The callback for this event could be used to close off any open connections, resources, etc. before you program terminates
clutch.on('shutDown', process.exit);

// Now try requesting the server: curl 'http://localhost:5000/'
