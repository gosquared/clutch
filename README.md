Clutch
===

Turn your single process node.js web server into a cluster of multiple processes. This allows the server to run on multiple CPUs, and adds an extra layer of redundancy to improve reliability.

### Multiple processes, multiple cores

Using cluster, your app becomes a 'master' process which can spawn any number of worker processes. Incoming connections to the listen port are then efficiently load-balanced across these workers by the operating system. Since each worker is its own process, a multi-core CPU can run more than one concurrently. As a result, your server is able to process more requests than it could as a single process, as well as making use of previously un-tapped CPU capacity.

### Multiple processes, more resilience

Running processes in a master / worker arrangement means the master process effectively becomes a watchdog and manager for its workers. If any workers crash, the remaining healthy workers will continue to accept connections while your master replaces the dead worker with a new one. While you should always work to fix any crashes, this improves the availability of your server when problems occur and is a convenient opportunity to implement logging and monitoring around application crashes. Of course, it is also advised that your master process itself is booted and supervised by a service such as upstart in Ubuntu.

### Install

`npm install gs-clutch`

### Usage

A simple web server example:

```javascript

var http = require('http');
var Clutch = require('gs-clutch');
var os = require('os');
var cluster = require('cluster');
var clutch = Clutch({
  numWorkers: os.cpus().length
});

if(cluster.isWorker){
  var server = http.createServer(function(req, res){
    res.send('Worker: ' + cluster.worker.id);
  }).listen(5000);
}

```

Now try requesting the server: curl 'http://localhost:5000/'
