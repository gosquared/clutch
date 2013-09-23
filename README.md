Clutch
===

Turn your single process node.js web server into a cluster of multiple processes. This allows the server to run on multiple CPUs, and adds an extra layer of redundancy to improve reliability.

### Multiple processes, multiple cores

When clustering, your app becomes a 'master' process which can spawn any number of worker processes. Incoming connections to the listen port are then efficiently load-balanced across these workers by the operating system. Since each worker is its own process, a multi-core CPU can run more than one concurrently. As a result, your server is able to process more requests than it could as a single process, as well as making use of previously un-tapped CPU capacity.

### Multiple processes, more resilience

Running processes in a master / worker arrangement means the master process effectively becomes a watchdog and manager for its workers. If any workers crash, the remaining healthy workers will continue to accept connections while your master replaces the dead worker with a new one. While you should always work to fix any crashes, this improves the availability of your server when problems occur and is a convenient opportunity to implement logging and monitoring around application crashes. Of course, it is also advised that your master process itself is booted and supervised by a service such as upstart in Ubuntu.

### Controlled termination

In cluster mode, processes listen out for system signals (SIGTERM, SIGINT, etc) that would otherwise terminate the process right away. Instead, these signals initiate the shutdown behaviour in clutch, where the master ensures all workers have exited before it quits itself.

A convenient feature of this is a controlled shutdown procedure before the process terminates. This gives you the opportunity to close off any open connections, finish pending work, and otherwise close off any activity that should complete before the process exits. Clutch implements a process `shutDown` event when it is ready to quit. Your application should listen for this event, run its shutdown procedure, and then call `process.exit` when it is ready to finish.

### Separate concerns

It is advisable to only set up a server in worker processes, so that the master's only task is to control the workers, rather than also running a web server. This is so that if there are any bugs in your server that causes crashes, it will only affect worker processes leaving the master stable and able to spawn replacement workers.

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

// The callback for this event could be used to close off any open connections, resources, etc. before you program terminates
clutch.on('shutDown', process.exit);

```

Now try requesting the server: `curl 'http://localhost:5000/'`

### Options

**numWorkers**

Default: `require('os').cpus().length`

Type: `integer`

Total number of worker processes to spawn & monitor. This is usually one worker per CPU.

Note: if you have several busy servers on a single server, tweak this option to ensure you have as close to one server worker per CPU core. E.g. if you have 2 busy servers on an 8 core machine, set numWorkers to 4 to avoid [context switch inefficiency](https://engineering.gosquared.com/optimising-nginx-node-js-and-networking-for-heavy-workloads).

**nameProcess**

Default: `true`

Type: `boolean`

Clutch can rename the title of the process so it's easier to inspect with tools such as `htop`, `ps` etc. Set this to false if you want to leave the title alone.

**log**

Default: `false`

Type: `boolean` or `function`

If set to true, debug output will be sent to STDOUT using `console.log`.

If you want to handle logs yourself, you can set this option to a function which will be called with the log string as an argument:

```javascript
log: function(str){ /* Do something like send write to a different stream, update counters, etc. */ }
```

**forceExitTimeout**

Default: `7500`

Type: `integer`

Unit: ms

Your application is expected to listen out for clutch's `shutDown` event, and exit the process after any required shutdown steps. When clutch emits `shutDown`, it also schedules a forced process exit if your application does not exit within this time. This option configures how long in milliseconds clutch waits before actioning the forced exit.
