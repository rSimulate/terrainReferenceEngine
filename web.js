var http = require('http');
var express = require('express');
var sys = require('sys');
var fs = require('fs');
var url = require('url');
var uuid = require('node-uuid');
var mongo = require('mongodb');
var ObjectID = mongo.ObjectID;

var mongoUri = process.env.MONGOLAB_URI || 'mongodb://localhost/terrainReferenceEngine';
var port = process.env.PORT || 5001;

String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

function getLinkByRel(links, rel) {
	for (var i in links) {
		if (links[i].rel === rel) {
			return links[i];
		}
	}
	return undefined;
}

var app = express();
app.configure(function(){ 
	app.use(express.bodyParser()); 
});

mongo.connect(mongoUri, {}, function(error, db) {
	console.log('connected to mongodb @ ' + mongoUri);
	db.addListener('error', function(error) {
		console.log(error);
	});

	// Endpoint resource
	app.get('/metasim/:version', function(request, response) {
		if (request.params.version == '1.0') {
			response.send({
				links: [{
					rel: '/rel/simulations',
					href: '/metasim/' + request.params.version+ '/simulations',
					method: 'GET'}]});
			
		} else {
			response.send(404, null);
		}
	});

	// Simulations resource
	app.get('/metasim/:version/simulations', function(request, response) {
		if (request.params.version == '1.0') {
			db.collection('simulations').find({}).toArray(function(err, simulations) {
				console.log('sending simulations' + JSON.stringify(simulations));
				response.send({
					simulations: simulations,
					links: [{
						rel: '/rel/add',
						href: '/metasim/' + request.params.version+ '/simulations',
						method: 'POST'}]});
			});
		} else {
			response.send(404, null);
		}
	});

	// Create a new simulation
	app.post('/metasim/:version/simulations', function(request, response) {
		console.log(JSON.stringify(request.body));
		var simulationUrl = request.body.simulation_href;
		console.log('Got main simulation path: ' + simulationUrl);
        var simulationId = simulationUrl.split('/').slice(-1);
        // Grab the simulation object from MetaSim
        // It is already filled out with bodies information`

        // Grab the simulation object from MetaSim
        http.get(simulationUrl, function(res) {
            var simulationHref = res.headers.location;
            console.log('response status: ' + res.status);
            console.log('response headers: ' + JSON.stringify(res.headers));
            console.log('Engine simulation created at ' + simulationHref);
            var body = '';
            res.on('data', function(chunk) {
                body += chunk;
            });
            res.on('end', function() {
                // only merge in body if an response was returned
                if (body != '') {
                    console.log('got simulation from MetaSim: ' + body);
                    var simulation = JSON.parse(body);
                    for(var i in simulation.bodies) {
                        // add a terrain link for each body
                        console.log('adding terrain link for body');
                        dataUrl = simulationHref + '/' + i + '/terrain/data.jpg';
                        if (simulation.bodies[i].links === undefined) {
                            simulation.bodies[i].links = [];
                        }
                        simulation.bodies[i].links.push({
                            rel: '/rel/world_texture',
                            href: dataUrl,
                            method: 'GET'});
                        simulation.forwardedPaths.push({
                            originalUrl: dataUrl, 
                            dest: url.format({
                                protocol: 'http',
                                hostname: request.host,
                                port: port,
                                pathname: dataUrl})});
                        // keep a record of the simulation locally
		                db.collection('simulations').insert(simulation);
                        
		                response.header('Location', url.format({
		                	protocol: 'http',
		                	hostname: request.host,
		                	port: port,
		                	pathname: request.originalUrl + '/' + simulationId}));
                        console.log('returning simulation: ' + JSON.stringify(simulation));
		                response.send(201, simulation);
                    }
                }
            });
        });
	});

	// Delete simulations
	app.delete('/metasim/:version/simulations/:id', function(request, response) {
		var version = request.params.version;
		if (version == '1.0') {
			var simulationId = request.params.id;
			if (db.collection('simulations').find({_id:simulationId}).count() > 0) {	
				db.collection('simulations').remove({_id:simulationId});
				response.send(204, null);
			} else {
				console.log('simulation ' + simulationId + ' not found');
				response.send(404, 'simulation ' + simulationId + ' not found');
			}
		} else {
			console.log('version ' + version + ' not found');
			response.send(404, 'version ' + version + ' not found');
		}
	});

	// Serve up simulation data
	app.get('/metasim/:version/simulations/:id/terrain/data.jpg', function(request, response) {
		response.sendfile('terrain.jpg');
	});
});

app.listen(port, function() {
    console.log("Listening on " + port);
});
