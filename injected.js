/**
 * Actual extension code is here.
 */


function createPlayer(url, type, subtitles) {
	/** 
	 * Creates flowplayer instance.
	 * Called after required video data is parsed.
	 */
	var m = document.getElementById("movieArea");
	while (m.firstChild)
		m.removeChild(m.firstChild);
	
	flowplayer("#movieArea", {
		clip: {
			sources: [
				{ type: type, src: url },
			],
			subtitles : subtitles,
		},
		subtitleParser: xmlSubtitleParser,
		embed : false,
	});
	
	// Create drag & drop target
	m.ondragover = function() {
		if (this.className.indexOf('drop-area-hover') == -1) {
			this.originalClassName = '' + this.className;
			this.className += ' drop-area-hover';
		}
		return false;
	};
	
	m.ondragend = function() {
		console.log("1>" + this.originalClassName);
		this.className = this.originalClassName;
		return false;
	};
	
	m.ondrop = function(e) {
		console.log("2>" + this.originalClassName);
		this.className = this.originalClassName;
		e.preventDefault();
		
		var file = e.dataTransfer.files[0];
		if ((file) && (file.name.endsWith(".srt") || file.name.endsWith(".vtt")))  {
			reader = new FileReader();
			reader.onload = function(event) {
				localStorage.setItem('custom-sub', event.target.result);
				if (location.href.indexOf("#") == -1)
					localStorage.setItem('custom-sub-url', location.href);
				else
					localStorage.setItem('custom-sub-url', location.href.substring(0, location.href.indexOf("#")));
				location.reload();
			};
			reader.readAsText(file);
			return true;
		}
	};
}

function seconds(timecode) {
	/** 
	 * Parses timecode in 00:12:34.56 format into floating number of seconds.
	 * Used by both srt and xml subtitle parser.
	 */
	var els = timecode.split(':');
	if (els.length == 2) els.unshift(0);
	return els[0] * 60 * 60 + els[1] * 60 + parseFloat(els[2].replace(',','.'));
}


function srtSubtitleParser(txt) {
	/** 
	 * This is almost exact copy of floplayer vtt parser, with only exception
	 * being support for srt timecode format.
	 */
	var TIMECODE_RE = /^(([0-9]{1,2}:){1,2}[0-9]{2}[,.][0-9]{3}) --\> (([0-9]{1,2}:){1,2}[0-9]{2}[,.][0-9]{3})(.*)/;
	
	var entries = [];
	for (var i = 0, lines = txt.split("\n"), len = lines.length, entry = {}, title, timecode, text, cue; i < len; i++) {
		timecode = TIMECODE_RE.exec(lines[i]);
		if (timecode) {
			// title
			title = lines[i - 1];
			
			// text
			text = "<p>" + lines[++i] + "</p><br/>";
			while (typeof lines[++i] === 'string' && lines[i].trim() && i < lines.length)
				text +=  "<p>" + lines[i] + "</p><br/>";
			
			entries.push({
				title: title,
				startTime: seconds(timecode[1]),
				endTime: seconds(timecode[3]),
				text: text
			});
		}
	}
	return entries;
}

var current_xml = null;	// Stores xml passed to xmlSubtitleParser for cases when
						// another language from same xml is passed

function xmlSubtitleParser(txt) {
	/** Parses TTML subtitle format used by Daisuki flash player */
	var xml;
	console.log("xmlSubtitleParser " + txt.substring(0, 20));
	console.info(flowplayer().subtitles);
	if (txt === 'use-custom') {
		// Special "data" url
		return srtSubtitleParser(localStorage['custom-sub']);
	}
	var lang = "English";
	if (txt.startsWith("use:")) {
		xml = current_xml;
		lang = txt.substr(4);
	} else {
		try {
			xml = $($.parseXML(txt));
		} catch (e) {
			// Not XML - parse as srt/vtt
			return srtSubtitleParser(txt);
		}
		current_xml = xml;
	}
	var subs = [];
	var i = 1;
	
	var div = xml; // all P's by default
	xml.find("div").each(function() {
		if (this.attributes['xml:lang'].value == lang)
			div = $(this);
	});
	
	console.log("Loading lang " + lang );
	console.log(div);
	div.find("p").each(function() {
		text = $(this).text().replace(/^\s+|\s+$/g, '');
		
		subs.push({
			title: i,
			startTime: seconds(this.attributes.begin.value),
			endTime: seconds(this.attributes.end.value),
			text: "<p>" + text.replace("\n", "<br/>") + "</p>"
		});
	});
	
	return subs;
}


function removeDefaults(subs) {
	// For every subtitle in array, clears 'default' flag.
	for(var i = 0; i < subs.length; i++)
		subs[i]["default"] = false;
}

$(document).ready(function() {
	/** That part that actually does interesting stuff */
	
	// Grab video data
	var m = document.getElementById("movie");
	var s = m.getElementsByTagName("script")[0].text;
	eval(s.substring(0, s.indexOf("swfobject")));
	
	// Grab url hash data - can be used to add additiona subtitle track
	var hash = location.hash.replace('#', '');
	var params = hash.split('&');
	var hashparams = {};
	for(var i = 0; i < params.length; i++){
		var propval = params[i].split('=');
		hashparams[propval[0]] = decodeURIComponent(propval[1]);
	}
	
	// Prepare stuff to send to server
	api_params = {
		"device_cd": flashvars["device_cd"],
		"ss_id": flashvars["ss_id"],
		"mv_id": flashvars["mv_id"],
		"ss1_prm": flashvars["ss1_prm"],
		"ss2_prm": flashvars["ss2_prm"],
		"ss3_prm": flashvars["ss3_prm"],
	};
	
	// window.bgnEncrypt and window.bgnGetKey are provided by original page code
	params = {
		"s": flashvars["s"],
		"c": flashvars["ss3_prm"],
		"e": location.href,
		"d": window.bgnEncrypt(api_params),
		"a": window.bgnGetKey(),
	};
	
	
	// Request video data
	$.get("http://www.daisuki.net" + flashvars['init'], params, function(data) {
		// window.bgnDecrypt is provided by original page as well.
		init_data = window.bgnDecrypt(data.rtn);
		console.log(init_data);
		
		// Get 'playlist' with alternative streams
		$.get(init_data.play_url, function(data) {
			window.playlist_data = data;
			var p = data.split("\n");
			
			// Chose last (best available) stream
			var url = p.pop();
			while (url === "") url = p.pop();
			
			// Generate list of subtitle tracks
			var subs = [];
			if (init_data.caption_url) {
				if (init_data.caption_lang) {
					subs = [ ];
						var ce = Object.keys(init_data.caption_lang[0])[0];
						var la = init_data.caption_lang[0][ce];
						if (la != "English"){
							subs.push({
							kind: "subtitles",
							"default": true,
							srclang: "English",
							label: "English",
							src: init_data.caption_url,
						});	
						}
					for (var i = 0; i < init_data.caption_lang.length; i++) {
						var code = Object.keys(init_data.caption_lang[i])[0];
						var label = init_data.caption_lang[i][code];
						var def = (label == "English");
						var src = def ? init_data.caption_url : ("data:text/plain,use:" + label);
						subs.push({
							kind: "subtitles",
							"default": def,
							srclang: label,
							label: label,
							src: src,
						});
						def = false;
					}
				} else {
					// Only one language is available, assume english
					subs = [{ kind: "subtitles", "default": true,
						srclang: "en", label: "English",
						id: null,
						src: init_data.caption_url
					}];
				}
			}
			
			// Add user-provided subtitle track, if any
			if (hashparams.sub) {
				console.log(hashparams);
				// Only user-provided subtitle track should be default
				removeDefaults(subs);
				var lang = hashparams.lang || "unk";
				var label = hashparams.label || "Unknown";
				subs.push({ kind:"subtitles", "default":true,
					srclang: lang, label: label,
					src: hashparams.sub }
				);
			}
			
			// Add drag&dropped subtitles, if set
			if (localStorage['custom-sub-url'] && location.href.startsWith(localStorage['custom-sub-url'])) {
				removeDefaults(subs);
				subs.push({ kind:"subtitles", "default":true,
					srclang: "unk", label: "Custom",
					src: "data:text/plain,use-custom"
				});
			}
			
			
			console.log(url);
			console.log(subs);
			
			// Feed player instance with parsed values
			createPlayer(url, "application/x-mpegURL", subs);
			
		});
	});
});
