//-------------------------------------------------------------------
// Marbles Chaincode Library
//-------------------------------------------------------------------
var path = require('path');

module.exports = function (enrollObj, g_options, logger) {
	var marbles_chaincode = {};
	var l_logger = console;
	l_logger.log = console.log;
	l_logger.debug = console.log;
	l_logger.error = console.log;
	var fcw = require(path.join(__dirname, './fc_wrangler/index.js'))(l_logger);


	// Chaincode -------------------------------------------------------------------------------

	//check chaincode
	marbles_chaincode.check_if_already_deployed = function (options, cb) {
		console.log('\nchecking for chaincode...');

		var opts = {
			channel_id: g_options.channel_id,
			chaincode_id: g_options.chaincode_id,
			chaincode_version: g_options.chaincode_version,
			cc_function: 'read',
			cc_args: ['abc']
		};
		fcw.query_chaincode(enrollObj, opts, function(err, resp){
			if(err != null){
				if(cb) return cb(err, resp);
			}
			else{
				if(resp.parsed == null){							//if nothing is here, no chaincode
					if(cb) return cb({error: 'chaincode not found'}, resp);
				}
				else{
					if(cb) return cb(null, resp);
				}
			}
		});
	};


	// Marbles -------------------------------------------------------------------------------

	//create a marble
	marbles_chaincode.create_a_marble = function (options, cb) {
		console.log('\ncreating a marble...');

		var opts = {
			channel_id: g_options.channel_id,
			chaincode_id: g_options.chaincode_id,
			chaincode_version: g_options.chaincode_version,
			event_url: g_options.event_url,
			endorsed_hook: options.endorsed_hook,
			ordered_hook: options.ordered_hook,
			cc_function: 'init_marble',
			cc_args: [
				options.args.marble_id,
				options.args.color,
				options.args.size,
				options.args.marble_owner,
				options.args.owners_company,
				options.args.auth_company
			]
		};
		fcw.invoke_chaincode(enrollObj, opts, cb);
	};

	//get list of marbles
	marbles_chaincode.get_marble_list = function (options, cb) {
		console.log('\nfetching marble index list...');

		var opts = {
			channel_id: g_options.channel_id,
			chaincode_version: g_options.chaincode_version,
			chaincode_id: g_options.chaincode_id,
			cc_function: 'compelte_marble_index',
			cc_args: [' ']
		};
		fcw.query_chaincode(enrollObj, opts, cb);
	};

	//get marble
	marbles_chaincode.get_marble = function (options, cb) {
		console.log('\nfetching marble ' + options.marble_id + ' list...');

		var opts = {
			channel_id: g_options.channel_id,
			chaincode_version: g_options.chaincode_version,
			chaincode_id: g_options.chaincode_id,
			cc_function: 'read',
			cc_args: [options.args.marble_id]
		};
		fcw.query_chaincode(enrollObj, opts, cb);
	};

	//set marble owner
	marbles_chaincode.set_marble_owner = function (options, cb) {
		console.log('\nsetting marble owner...');

		var opts = {
			channel_id: g_options.channel_id,
			chaincode_id: g_options.chaincode_id,
			chaincode_version: g_options.chaincode_version,
			event_url: g_options.event_url,
			endorsed_hook: options.endorsed_hook,
			ordered_hook: options.ordered_hook,
			cc_function: 'set_owner',
			cc_args: [
				options.args.marble_id,
				options.args.marble_owner,
				options.args.owners_company,
				options.args.auth_company
			]
		};
		fcw.invoke_chaincode(enrollObj, opts, cb);
	};

	//delete marble
	marbles_chaincode.delete_marble = function (options, cb) {
		console.log('\ndeleting a marble...');

		var opts = {
			channel_id: g_options.channel_id,
			chaincode_id: g_options.chaincode_id,
			chaincode_version: g_options.chaincode_version,
			event_url: g_options.event_url,
			endorsed_hook: options.endorsed_hook,
			ordered_hook: options.ordered_hook,
			cc_function: 'delete_marble',
			cc_args: [options.args.marble_id, options.args.auth_company]
		};
		fcw.invoke_chaincode(enrollObj, opts, cb);
	};


	// Owners -------------------------------------------------------------------------------

	//register a owner/user
	marbles_chaincode.register_owner = function (options, cb) {
		console.log('\nCreating a marble owner\n');

		var opts = {
			channel_id: g_options.channel_id,
			chaincode_id: g_options.chaincode_id,
			chaincode_version: g_options.chaincode_version,
			event_url: g_options.event_url,
			endorsed_hook: options.endorsed_hook,
			ordered_hook: options.ordered_hook,
			cc_function: 'init_owner',
			cc_args: [options.args.marble_owner, options.args.owners_company]
		};
		fcw.invoke_chaincode(enrollObj, opts, cb);
	};

	//get a owner/user
	marbles_chaincode.get_owner = function (options, cb) {
		var full_username = build_owner_name(options.args.marble_owner, options.args.owners_company);
		console.log('\nFetching owner ' + full_username + ' list...');

		var opts = {
			channel_id: g_options.channel_id,
			chaincode_id: g_options.chaincode_id,
			chaincode_version: g_options.chaincode_version,
			cc_function: 'read',
			cc_args: [full_username]
		};
		fcw.query_chaincode(enrollObj, opts, cb);
	};

	//get the owner list
	marbles_chaincode.get_owner_list = function (options, cb) {
		console.log('\nFetching owner index list...');

		var opts = {
			channel_id: g_options.channel_id,
			chaincode_id: g_options.chaincode_id,
			chaincode_version: g_options.chaincode_version,
			cc_function: 'read',
			cc_args: ['_ownerindex']
		};
		fcw.query_chaincode(enrollObj, opts, cb);
	};

	//build full name
	marbles_chaincode.build_owner_name = function (username, company) {
		return build_owner_name(username, company);
	};


	// All ---------------------------------------------------------------------------------

	//build full name
	marbles_chaincode.read_everything = function (options, cb) {
		console.log('\nFetching EVERYTHING...');

		var opts = {
			channel_id: g_options.channel_id,
			chaincode_version: g_options.chaincode_version,
			chaincode_id: g_options.chaincode_id,
			cc_function: 'read_everything',
			cc_args: ['']
		};
		fcw.query_chaincode(enrollObj, opts, cb);
	};


	// Other -------------------------------------------------------------------------------

	// Format Owner's Actual Key Name
	function build_owner_name(username, company) {
		return username.toLowerCase() + '.' + company;
	}

	return marbles_chaincode;
};

