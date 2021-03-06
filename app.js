'use strict';
/* global process */
/* global __dirname */
/*******************************************************************************
 * Copyright (c) 2015 IBM Corp.
 *
 * All rights reserved.
 *
 *******************************************************************************/
var express = require('express');
var session = require('express-session');
var compression = require('compression');
var serve_static = require('serve-static');
var path = require('path');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var http = require('http');  
var app = express();
var url = require('url');
var cors = require('cors');
var async = require('async');
var ws = require('ws');											//websocket module 

// --- Set Our Things --- //
var block_delay = 10000;										//should be exactly the block delay
var logger = {													//overwrite console to work with info/warn/debug
	log: console.log,
	info: console.log,
	error: console.error,
	warn: console.log,
	debug: console.log
};
var fcw = require('./utils/fc_wrangler/index.js')(logger);

var more_entropy = randStr(32);
var ws_server = require('./utils/websocket_server_side.js')(null, null, null);
var helper = require(__dirname + '/utils/helper.js')(process.env.creds_filename, logger);
var host = 'localhost';
var port = helper.getMarblesPort();
var wss = {};
process.env.marble_company = helper.getCompanyName();

// ------------- Bluemix Detection ------------- //
if(process.env.VCAP_APPLICATION){
	host = '0.0.0.0';							//overwrite defaults
	port = process.env.PORT;
}

// --- Pathing and Module Setup --- //
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.engine('.html', require('jade').__express);
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use( serve_static(path.join(__dirname, 'public')) );
app.use( session({secret:'Somethignsomething1234!test', resave:true, saveUninitialized:true}) );
app.options('*', cors());
app.use(cors());

//---------------------
// Cache Busting Hash
//---------------------
var bust_js = require('./busters_js.json');
var bust_css = require('./busters_css.json');
process.env.cachebust_js = bust_js['public/js/singlejshash'];			//i'm just making 1 hash against all js for easier jade implementation
process.env.cachebust_css = bust_css['public/css/singlecsshash'];		//i'm just making 1 hash against all css for easier jade implementation
console.log('cache busting hash js', process.env.cachebust_js, 'css', process.env.cachebust_css);

// ============================================================================================================================
// 													Webserver Routing
// ============================================================================================================================
app.use(function(req, res, next){
	var keys;
	console.log('------------------------------------------ incoming request ------------------------------------------');
	console.log('New ' + req.method + ' request for', req.url);
	req.bag = {};																			//create object for my stuff
	req.bag.session = req.session;

	var url_parts = url.parse(req.url, true);
	req.parameters = url_parts.query;
	keys = Object.keys(req.parameters);
	if(req.parameters && keys.length > 0) console.log({parameters: req.parameters});		//print request parameters for debug
	keys = Object.keys(req.body);
	if (req.body && keys.length > 0) console.log({body: req.body});							//print request body for debug
	next();
});
app.use('/', require('./routes/site_router'));

// ------ Error Handling --------
app.use(function(req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});
app.use(function(err, req, res, next) {														// = development error handler, print stack trace
	console.log('Error Handeler -', req.url);
	var errorCode = err.status || 500;
	res.status(errorCode);
	req.bag.error = {msg:err.stack, status:errorCode};
	if(req.bag.error.status == 404) req.bag.error.msg = 'Sorry, I cannot locate that file';
	res.render('template/error', {bag:req.bag});
});


// ============================================================================================================================
// 														Launch Webserver
// ============================================================================================================================
var server = http.createServer(app).listen(port, function() {});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.NODE_ENV = 'production';
server.timeout = 240000;																							// Ta-da.
console.log('------------------------------------------ Server Up - ' + host + ':' + port + ' ------------------------------------------');
if(process.env.PRODUCTION) console.log('Running using Production settings');
else console.log('Running using Developer settings');


// ============================================================================================================================
// 														Warning
// ============================================================================================================================

// ============================================================================================================================
// 														Entering
// ============================================================================================================================

// ============================================================================================================================
// 														Work Area
// ============================================================================================================================

// ==================================
// Set up the blockchain sdk
// ==================================
var enrollObj = null;
var marbles_lib = null;

// -------------------------------------------------------------------
// Life Starts Here!
// -------------------------------------------------------------------
process.env.app_state = 'starting';
process.env.app_first_setup = 'yes';
setupWebSocket();

try{
	var hash = helper.getMarbleStartUpHash();
	console.log('what is what', hash, helper.getHash());
	if(hash === helper.getHash()){
		console.log('\n\nDetected that we have launched successfully before');
		console.log('Welcome back - Initiating start up\n\n');
		process.env.app_first_setup = 'no';
		enroll_admin(function(e){
			if(e == null){
				setup_marbles_lib();
			}
		});
	}
	else wait_to_init();
}
catch(e){
	wait_to_init();
}

function wait_to_init(){
	process.env.app_state = 'start_waiting';
	process.env.app_first_setup = 'yes';
	console.log('\n\nDetected that we have NOT launched successfully yet');
	console.log('Open your browser to http://' + host + ':' + port + ' and login as "admin" to initiate startup\n\n');
}
// -------------------------------------------------------------------

//setup marbles library and check if cc is deployed
function setup_marbles_lib(){
	console.log('Setup Marbles Lib...');

	var opts = {
		channel_id: helper.getChannelId(), 
		chaincode_id: helper.getChaincodeId(),
		event_url: helper.getPeerEventUrl(0),
		chaincode_version: helper.getChaincodeVersion(),
	};
	marbles_lib = require('./utils/marbles_cc_lib.js')(enrollObj, opts, console);
	ws_server.setup(enrollObj, marbles_lib, wss.broadcast, null);

	console.log('Checking if chaincode is already deployed or not');
	var options = 	{
						peer_urls: [helper.getPeersUrl(0)],
					};
	marbles_lib.check_if_already_deployed(options, function(not_deployed, enrollUser){
		if(not_deployed){										//if this is truthy we have not yet deployed.... error
			console.log('\n\nChaincode ID was not detected: "' + helper.getChaincodeId()+ '", all stop');
			console.log('\n\nYou can deploy this chaincode or change the ID from the UI');
			console.log('Open your browser to http://' + host + ':' + port + ' and login to redo/init startup');
			process.env.app_first_setup = 'yes';				//overwrite state, bad startup
			broadcast_state('no_chaincode');
		}
		else{													//else we already deployed
			console.log('\n\nChaincode already deployed\n\n');
			broadcast_state('found_chaincode');

			var user_base = null;
			if(process.env.app_first_setup === 'yes') user_base = helper.getMarbleUsernames();
			create_assets(user_base); 							//builds marbles, then starts webapp
		}
	});
}

//enroll an admin with the CA for this peer/channel
function enroll_admin(cb){
	var user = helper.getUser(0);
	var options = {
		channel_id: helper.getChannelId(),
		uuid: helper.getNetworkId() + '-' + helper.getChannelId(),
		ca_url: helper.getCasUrl(0),
		orderer_url: helper.getOrderersUrl(0),
		peer_urls: [helper.getPeersUrl(0)],
		enroll_id: user.enrollId,
		enroll_secret: user.enrollSecret,
		msp_id: helper.getPeersMspId(0)
	};
	fcw.enroll(options, function(errCode, obj){
		if (errCode != null) {
			console.error('could not enroll');
			if(cb) cb(errCode);
		} else{
			enrollObj = obj;
			if(cb) cb(null);
		}
	});
}

//random integer
function getRandomInt(min, max) {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min)) + min;
}

//random string of x length
function randStr(length){
	var text = '';
	var possible = 'abcdefghijkmnpqrstuvwxyz0123456789';
	for(var i=0; i < length; i++ ) text += possible.charAt(Math.floor(Math.random() * possible.length));
	return text;
}

//real simple hash
function simple_hash(a_string){
	var hash = 0;
	for(var i in a_string) hash ^= a_string.charCodeAt(i);
	return hash;
}

//create random marble arguments (it is not important for it to be random, just more fun)
function build_marble_options(username, company){
	var colors = ['white', 'green', 'blue', 'purple', 'red', 'pink', 'orange', 'black', 'yellow'];
	var sizes = ['35', '16'];
	var color_index = simple_hash(more_entropy + company) % colors.length;		//build a psudeo random index to pick a color
	var size_index = getRandomInt(0, sizes.length);								//build a random size for this marble
	return 	{
				marble_id: randStr(24),
				color: colors[color_index],
				size: sizes[size_index],
				marble_owner: username,
				owners_company: company,
				auth_company: process.env.marble_company
			};
}

//this only runs after we deploy
function create_assets(build_marbles_users){
	console.log('Creating marble owners and marbles');

	if(build_marbles_users && build_marbles_users.length > 0){
		async.eachLimit(build_marbles_users, 1, function(username, user_cb) { 	//iter through each one ONLY ONE! [important]
			console.log('debug 3 - on user', username, Date.now());

			// --- Create Each User, Serially --- //
			pessimistic_create_owner(0, username, function(){
				user_cb();
			});

		}, function(err) {
			console.log('- finished creating owners, now for marbles');
			if(err == null) {

				// --- Create Marbles, 2 Users at a Time --- //
				async.eachLimit(build_marbles_users, 2, function(username, marble_cb) { //iter through each one 

					// --- Create 2 Marbles Serially --- //
					console.log('debug 4 - on user', username, Date.now());
					create_marbles(username, marble_cb);

				}, function(err) {													//marble owner creation finished
					console.log('- finished creating assets, waiting for peer catch up');
					if(err == null) {
						all_done();													//delay for peer catch up
					}
				});
			}
		});
	}
	else{
		console.log('- there are no new marble owners to create');
		all_done();
	}
}

//create the owner in a loop until it exists - repeat until we see the correct error! (yes, i know)
function pessimistic_create_owner(attempt, username, cb){
	var options = 	{
						peer_urls: [helper.getPeersUrl(0)],
						args: 	{
									marble_owner: username,
									owners_company: process.env.marble_company
								}
					};

	marbles_lib.register_owner(options, function(e){

		// --- Does the user exist yet? --- //
		if(e && e.parsed && e.parsed.indexOf('owner already exists') >= 0){
			console.log('\n\nfinally the user exists, this is a good thing, moving on\n\n');
			cb(null);
		}
		else{

			// -- Try again -- //
			if(attempt < 4){
				setTimeout(function(){								//delay for peer catch up
					console.log('owner existance is not yet confirmed, trying again', attempt, username, Date.now());
					return pessimistic_create_owner(++attempt, username, cb);
				}, block_delay + 1000*attempt);
			}

			// -- Give Up -- //
			else{
				console.log('giving up on creating the user', attempt, username, Date.now());
				if(cb) return cb(e);
				else return;
			}
		}
	});
}

//create some marbles
function create_marbles(username, cb){
	async.eachLimit([1,2], 1, function(block_height, marble_cb) {	//create two marbles for every user
		var randOptions = build_marble_options(username, process.env.marble_company);
		console.log('\n\ngoing to create marble:', randOptions);
		var options = 	{
							chaincode_id: helper.getChaincodeId(),
							peer_urls: [helper.getPeersUrl(0)],
							args: randOptions
						};
		marbles_lib.create_a_marble(options, function(){
			setTimeout(function(){
				marble_cb();
			}, block_delay);
		});
	}, function() {
		console.log('debug 2 - ok returning', Date.now());
		return cb();												//marble creation finished
	});
}

//we are done, inform the clients
function all_done(){
	console.log('\n------------------------------------------ All Done ------------------------------------------\n');
	broadcast_state('registered_owners');
	process.env.app_first_setup = 'no';

	console.log('hash is', helper.getHash());
	helper.write({hash: helper.getHash()});							//write state file so we know we started before
	ws_server.check_for_updates(null);								//call the periodic task to get the state of everything
}

//message to client to communicate where we are in the start up
function build_state_msg(){
	return 	{
				msg: 'app_state', 
				state: process.env.app_state, 
				first_setup: process.env.app_first_setup
			};
}

//send to all connected clients
function broadcast_state(new_state){
	process.env.app_state = new_state;
	wss.broadcast(build_state_msg());											//tell client our app state
}


// ============================================================================================================================
// 												WebSocket Communication Madness
// ============================================================================================================================
function setupWebSocket(){
	console.log('------------------------------------------ Websocket Up ------------------------------------------');
	wss = new ws.Server({server: server});										//start the websocket now
	wss.on('connection', function connection(ws) {
		ws.on('message', function incoming(message) {
			console.log('received ws msg:', message);
			try{
				var data = JSON.parse(message);
				if(data.type == 'setup'){
					console.log('! [ws] setup message', data);

					//enroll admin
					if(data.configure === 'enrollment'){
						helper.write(data);										//write new config data to file
						enroll_admin(function(e){
							if(e == null){
								setup_marbles_lib();
							}
						});
					}

					//find deployed chaincode
					else if(data.configure === 'find_chaincode'){
						helper.write(data);										//write new config data to file
						enroll_admin(function(e){								//re-renroll b/c we may be using new peer/order urls
							if(e == null){
								setup_marbles_lib();
							}
						});
					}

					//register marble owners
					else if(data.configure === 'register'){
						create_assets(data.build_marble_owners);
					}
				}
				else{
					ws_server.process_msg(ws, data);							//pass the websocket msg for processing
				}
			}
			catch(e){
				console.log('ws message error', e.stack);
			}
		});

		ws.on('error', function(e){console.log('ws error', e);});
		ws.on('close', function(){console.log('ws closed');});
		ws.send(JSON.stringify(build_state_msg()));								//tell client our app state
	});

	wss.broadcast = function broadcast(data) {									//send to all connections
		var i = 0;
		wss.clients.forEach(function each(client) {
			try{
				console.log('broadcasting to client', (++i), data.msg);
				client.send(JSON.stringify(data));
			}
			catch(e){
				console.log('error broadcast ws', e);
			}
		});
	};

	// ========================================================
	// Monitor the height of the blockchain
	// ========================================================
	// this code is no longer used, fabric v1 does not yet have APIs to get block data 1/5/2017
	// we will refactor this code when the apis exists

	/*hfc_util.monitor_blockheight(hfc.getPeer(peer_url), function(chain_stats) {		//there is a new block, lets refresh everything that has a state
		if(chain_stats && chain_stats.height){
			console.log('\nHey new block, lets refresh and broadcast to all', chain_stats.height-1);
			hfc_util.getBlockStats(peer, chain_stats.height - 1, cb_blockstats);
			wss.broadcast({msg: 'reset'});
			hfc_util.queryCC(admin, chaincode_id, 'read', ['_marbleindex'], cb_got_index);
			hfc_util.queryCC(admin, chaincode_id, 'read', ['_opentrades'], cb_got_trades);
		}

		//got the block's stats, lets send the statistics
		function cb_blockstats(e, stats){
			if(e != null) console.log('blockstats error:', e);
			else {
				chain_stats.height = chain_stats.height - 1;							//its 1 higher than actual height
				stats.height = chain_stats.height;										//copy
				wss.broadcast({msg: 'chainstats', e: e, chainstats: chain_stats, blockstats: stats});
			}
		}

		//got the marble index, lets get each marble
		function cb_got_index(e, index){
			if(e != null) console.log('marble index error:', e);
			else{
				try{
					var json = JSON.parse(index);
					for(var i in json){
						console.log('!', i, json[i]);
						//iter over each, read their values
						hfc_util.queryCC(admin, chaincode_id, 'read', [json[i]], cb_got_marble);
					}
				}
				catch(e){
					console.log('marbles index msg error:', e);
				}
			}
		}

		//call back for getting a marble, lets send a message
		function cb_got_marble(e, marble){
			if(e != null) console.log('marble error:', e);
			else {
				try{
					wss.broadcast({msg: 'marbles', marble: JSON.parse(marble)});
				}
				catch(e){
					console.log('marble msg error', e);
				}
			}
		}

		//call back for getting open trades, lets send the trades
		function cb_got_trades(e, trades){
			if(e != null) console.log('trade error:', e);
			else {
				try{
					console.log('Found open trades: ' + trades);
					if (trades !== '') {
						trades = JSON.parse(trades);
						if(trades && trades.open_trades){
							wss.broadcast({msg: 'open_trades', open_trades: trades.open_trades});
						}
					}
					else {
						console.log('No open trades');
					}
				}
				catch(e){
					console.log('trade msg error', e);
				}
			}
		}
	});*/
}
