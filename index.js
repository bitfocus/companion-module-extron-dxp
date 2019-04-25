var tcp = require('../../tcp');
var instance_skel = require('../../instance_skel');
var TelnetSocket = require('../../telnet');
var debug;
var log;


function instance(system, id, config) {
	var self = this;

	// Request id counter
	self.request_id = 0;
	self.login = false;
	// super-constructor
	instance_skel.apply(this, arguments);
	self.status(1,'Initializing');
	self.actions(); // export actions

	return self;
}

instance.prototype.updateConfig = function(config) {
	var self = this;
	self.config = config;
	self.init_tcp();
};

instance.prototype.incomingData = function(data) {
	var self = this;
	debug(data);

	// Match part of the copyright response from unit when a connection is made.
	// Send Info request which should reply with Matrix setup, eg: "V8X4 A8X4"
	if (self.login === false && data.match("Extron Electronics DXP")) {
		self.status(self.STATUS_WARNING,'Logging in');
		self.socket.write("I"+ "\n");
	}

	if (self.login === false && data.match("Password:")) {
		self.status(self.STATUS_WARNING,'Logging in');
		self.socket.write(""+ "\n");
	}

	// Match first letter of expected response from unit.
	else if (self.login === false && data.match("V")) {
		self.login = true;
		self.status(self.STATUS_OK);
		debug("logged in");
	}
	else if (self.login === false && data.match('login incorrect')) {
		self.log('error', "incorrect username/password (expected no password)");
		self.status(self.STATUS_ERROR, 'Incorrect user/pass');
	}
	else {
		debug("data nologin", data);
	}
};

instance.prototype.init = function() {
	var self = this;

	debug = self.debug;
	log = self.log;

	self.init_tcp();
};

instance.prototype.init_tcp = function() {
	var self = this;
	var receivebuffer = '';

	if (self.socket !== undefined) {
		self.socket.destroy();
		delete self.socket;
		self.login = false;
	}

	if (self.config.host) {
		self.socket = new TelnetSocket(self.config.host, 23);

		self.socket.on('status_change', function (status, message) {
			if (status !== self.STATUS_OK) {
				self.status(status, message);
			}
		});

		self.socket.on('error', function (err) {
			debug("Network error", err);
			self.log('error',"Network error: " + err.message);
		});

		self.socket.on('connect', function () {
			debug("Connected");
			self.login = false;
		});

		self.socket.on('error', function (err) {
			debug("Network error", err);
			self.log('error',"Network error: " + err.message);
			self.login = false;
		});

		// if we get any data, display it to stdout
		self.socket.on("data", function(buffer) {
			var indata = buffer.toString("utf8");
			self.incomingData(indata);
		});

		self.socket.on("iac", function(type, info) {
			// tell remote we WONT do anything we're asked to DO
			if (type == 'DO') {
				socket.write(new Buffer([ 255, 252, info ]));
			}

			// tell the remote DONT do whatever they WILL offer
			if (type == 'WILL') {
				socket.write(new Buffer([ 255, 254, info ]));
			}
		});
	}
};

instance.prototype.CHOICES_TYPE = [
	{ label: 'Audio & Video', id: '!' },
	{ label: 'Video only', id: '%' },
	{ label: 'Audio only', id: '$'}
]
// Return config fields for web config
instance.prototype.config_fields = function () {
	var self = this;

	return [
		{
			type: 'text',
			id: 'info',
			width: 12,
			label: 'Information',
			value: 'This will establish a telnet connection to the DXP'
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'DXP IP address',
			width: 12,
			default: '192.168.0.1',
			regex: self.REGEX_IP
		}
	]
};

// When module gets deleted
instance.prototype.destroy = function() {
	var self = this;

	if (self.socket !== undefined) {
		self.socket.destroy();
	}

	debug("destroy", self.id);;
};

instance.prototype.actions = function(system) {
	var self = this;
	var actions = {
		'route': {
			label: 'Route input to output',
			options: [{
					type: 'textinput',
					label: 'input',
					id: 'input',
					regex: self.REGEX_NUMBER
			}, {
				type: 'textinput',
				label: 'output',
				id: 'output',
				regex: self.REGEX_NUMBER
			}, {
				type: 'dropdown',
				label: 'type',
				id: 'type',
				choices: self.CHOICES_TYPE,
				default: '!'
			}]
		},
		'inputToAll': {
			label: 'Route input to all outputs',
			options: [{
					type: 'textinput',
					label: 'input',
					id: 'input',
					regex: self.REGEX_NUMBER
			}, {
				type: 'dropdown',
				label: 'type',
				id: 'type',
				choices: self.CHOICES_TYPE,
				default: '!'
			}]
		},
		'recall': {
			label: 'Recall preset',
			options: [{
					type: 'textinput',
					label: 'preset',
					id: 'preset',
					regex: self.REGEX_NUMBER
			}]
		}
	};

	self.setActions(actions);
}

instance.prototype.action = function(action) {

	var self = this;
	var id = action.action;
	var opt = action.options;
	var cmd;
	console.log("Sending some action: ", id);

	switch (id) {
		case 'route':
			cmd = opt.input +'*'+ opt.output + opt.type;
			break;

		case 'inputToAll':
			cmd = opt.input +'*'+ opt.type;
			break;

		case 'recall':
			cmd = opt.preset +'.';
			break;
/***** Policy not to use custom commands as there are no restrictions
		case 'command':
			cmd = opt.command;
			break;
*/
	}

	if (cmd !== undefined) {
			if (self.tcp !== undefined) {
					debug('sending ', cmd, "to", self.tcp.host);
					self.tcp.send(cmd);
			}
	}

	if (cmd !== undefined) {

		if (self.socket !== undefined && self.socket.connected) {
			self.socket.write(cmd+"\n");
		} else {
			debug('Socket not connected :(');
		}

	}
};

instance_skel.extendedBy(instance);
exports = module.exports = instance;
