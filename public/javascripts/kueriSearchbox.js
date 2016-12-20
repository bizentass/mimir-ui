
 (function(a){a.event.special.textchange={setup:function(){a(this).data("lastValue",this.contentEditable==="true"?a(this).html():a(this).val());a(this).bind("keyup.textchange",a.event.special.textchange.handler);a(this).bind("cut.textchange paste.textchange input.textchange",a.event.special.textchange.delayedHandler)},teardown:function(){a(this).unbind(".textchange")},handler:function(){a.event.special.textchange.triggerIfChanged(a(this))},delayedHandler:function(){var c=a(this);setTimeout(function(){a.event.special.textchange.triggerIfChanged(c)},
 25)},triggerIfChanged:function(a){var b=a[0].contentEditable==="true"?a.html():a.val();b!==a.data("lastValue")&&(a.trigger("textchange",[a.data("lastValue")]),a.data("lastValue",b))}};a.event.special.hastext={setup:function(){a(this).bind("textchange",a.event.special.hastext.handler)},teardown:function(){a(this).unbind("textchange",a.event.special.hastext.handler)},handler:function(c,b){b===""&&b!==a(this).val()&&a(this).trigger("hastext")}};a.event.special.notext={setup:function(){a(this).bind("textchange",
 a.event.special.notext.handler)
 }, teardown: function () { a(this).unbind("textchange", a.event.special.notext.handler) }, handler: function (c, b) { a(this).val() === "" && a(this).val() !== b && a(this).trigger("notext") }
 }
 })(jQuery);
/*jshint browser:true */
/*global jQuery */
(function ($) {
    "use strict";

    var XmlRpcFault = function () {
        Error.apply(this, arguments);
    };
    XmlRpcFault.prototype = new Error();
    XmlRpcFault.prototype.type = 'XML-RPC fault';

    var xmlrpc = $.xmlrpc = function (url, settings) {

        if (arguments.length === 2) {
            settings.url = url;
        } else {
            settings = url;
            url = settings.url;
        }

        settings.dataType = 'xml json';
        settings.type = 'POST';
        settings.contentType = 'text/xml';
        settings.converters = { 'xml json': xmlrpc.parseDocument };

        var xmlDoc = xmlrpc.document(settings.methodName, settings.params || []);

        if ("XMLSerializer" in window) {
            settings.data = new window.XMLSerializer().serializeToString(xmlDoc);
        } else {
            // IE does not have XMLSerializer
            settings.data = xmlDoc.xml;
        }

        return $.ajax(settings);
    };

    /**
	* Make an XML document node.
	*/
    xmlrpc.createXMLDocument = function () {

        if (document.implementation && "createDocument" in document.implementation) {
            // Most browsers support createDocument
            return document.implementation.createDocument(null, null, null);

        } else {
            // IE uses ActiveXObject instead of the above.
            var i, length, activeX = [
				"MSXML6.DomDocument", "MSXML3.DomDocument",
				"MSXML2.DomDocument", "MSXML.DomDocument", "Microsoft.XmlDom"
            ];
            for (i = 0, length = activeX.length; i < length; i++) {
                try {
                    return new ActiveXObject(activeX[i]);
                } catch (_) { }
            }
        }
    };

    /**
	* Make an XML-RPC document from a method name and a set of parameters
	*/
    xmlrpc.document = function (name, params, xmlns) {
        var doc = xmlrpc.createXMLDocument();


        var $xml = function (name) {
            return $(doc.createElement(name));
        };

        var $methodName = $xml('methodName').text(name);
        var $params = $xml('params').append($.map(params, function (param) {
            var $value = $xml('value').append(xmlrpc.toXmlRpc(param, $xml));
            return $xml('param').append($value);
        }));
        var $methodCall = $xml('methodCall').append($methodName, $params);
        $methodCall[0].setAttribute(xmlns || "xmlns:ex", "http://ws.apache.org/xmlrpc/namespaces/extensions");
        doc.appendChild($methodCall.get(0));
        return doc;
    };

    var _isInt = function (x) {
        return (x === parseInt(x, 10)) && !isNaN(x);
    };

    /**
	* Take a JavaScript value, and return an XML node representing the value
	* in XML-RPC style. If the value is one of the `XmlRpcType`s, that type is
	* used. Otherwise, a best guess is made as to its type. The best guess is
	* good enough in the vast majority of cases.
	*/
    xmlrpc.toXmlRpc = function (item, $xml) {

        if (item instanceof XmlRpcType) {
            return item.toXmlRpc($xml);
        }

        var types = $.xmlrpc.types;
        var type = $.type(item);

        switch (type) {
            case "undefined":
            case "null":
                return types.nil.encode(item, $xml);

            case "date":
                return types['datetime.iso8601'].encode(item, $xml);

            case "object":
                if (item instanceof ArrayBuffer) {
                    return types.base64.encode(item, $xml);
                } else {
                    return types.struct.encode(item, $xml);
                }
                break;


            case "number":
                // Ints and Floats encode differently
                if (_isInt(item)) {
                    return types['int'].encode(item, $xml);
                } else {
                    return types['double'].encode(item, $xml);
                }
                break;

            case "array":
            case "boolean":
            case "string":
                return types[type].encode(item, $xml);

            default:
                throw new Error("Unknown type", item);
        }
    };

    /**
	* Take an XML-RPC document and decode it to an equivalent JavaScript
	* representation.
	*
	* If the XML-RPC document represents a fault, then an equivalent
	* XmlRpcFault will be thrown instead
	*/
    xmlrpc.parseDocument = function (doc) {
        var $doc = $(doc);
        var $response = $doc.children('methodresponse');

        var $fault = $response.find('> fault');
        if ($fault.length === 0) {
            var $params = $response.find('> params > param > value');
            var json = JSON.parse($params.text());
            return json;
        } else {
            var fault = xmlrpc.parseNode($fault.find('> value > *').get(0));
            var err = new XmlRpcFault(fault.faultString);
            err.msg = err.message = fault.faultString;
            err.type = err.code = fault.faultCode;
            throw err;
        }
    };

    /*
	* Take an XML-RPC node, and return the JavaScript equivalent
	*/
    xmlrpc.parseNode = function (node) {

        // Some XML-RPC services return empty <value /> elements. This is not
        // legal XML-RPC, but we may as well handle it.
        if (node === undefined) {
            return null;
        }
        var nodename = node.nodeName.toLowerCase();
        if (nodename in xmlrpc.types) {
            return xmlrpc.types[nodename].decode(node);
        } else {
            throw new Error('Unknown type ' + nodename);
        }
    };

    /*
	* Take a <value> node, and return the JavaScript equivalent.
	*/
    xmlrpc.parseValue = function (value) {
        var child = $(value).children()[0];
        if (child) {
            // Child nodes should be decoded.
            return xmlrpc.parseNode(child);
        } else {
            // If no child nodes, the value is a plain text node.
            return $(value).text();
        }
    };

    var XmlRpcType = function () { };

    $.xmlrpc.types = {};

    /**
	* Make a XML-RPC type. We use these to encode and decode values. You can
	* also force a values type using this. See `$.xmlrpc.force()`
	*/
    xmlrpc.makeType = function (tagName, simple, encode, decode) {
        var Type;

        Type = function (value) {
            this.value = value;
        };
        Type.prototype = new XmlRpcType();
        Type.prototype.tagName = tagName;

        if (simple) {
            var simpleEncode = encode, simpleDecode = decode;
            encode = function (value, $xml) {
                var text = simpleEncode(value);
                return $xml(Type.tagName).text(text);
            };
            decode = function (node) {
                return simpleDecode($(node).text(), node);
            };
        }
        Type.prototype.toXmlRpc = function ($xml) {
            return Type.encode(this.value, $xml);
        };

        Type.tagName = tagName;
        Type.encode = encode;
        Type.decode = decode;

        xmlrpc.types[tagName.toLowerCase()] = Type;
    };


    // Number types
    var _fromInt = function (value) { return '' + Math.floor(value); };
    var _toInt = function (text, _) { return parseInt(text, 10); };

    xmlrpc.makeType('int', true, _fromInt, _toInt);
    xmlrpc.makeType('i4', true, _fromInt, _toInt);
    xmlrpc.makeType('i8', true, _fromInt, _toInt);
    xmlrpc.makeType('i16', true, _fromInt, _toInt);
    xmlrpc.makeType('i32', true, _fromInt, _toInt);

    xmlrpc.makeType('double', true, String, function (text) {
        return parseFloat(text, 10);
    });

    // String type. Fairly simple
    xmlrpc.makeType('string', true, String, String);

    // Boolean type. True == '1', False == '0'
    xmlrpc.makeType('boolean', true, function (value) {
        return value ? '1' : '0';
    }, function (text) {
        return text === '1';
    });

    // Dates are a little trickier
    var _pad = function (n) { return n < 10 ? '0' + n : n; };

    xmlrpc.makeType('dateTime.iso8601', true, function (d) {
        return [
			d.getUTCFullYear(), '-', _pad(d.getUTCMonth() + 1), '-',
			_pad(d.getUTCDate()), 'T', _pad(d.getUTCHours()), ':',
			_pad(d.getUTCMinutes()), ':', _pad(d.getUTCSeconds()), 'Z'
        ].join('');
    }, function (text) {
        return new Date(text);
    });

    // Go between a base64 string and an ArrayBuffer
    xmlrpc.binary = (function () {
        var pad = '=';
        var toChars = ('ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
			'abcdefghijklmnopqrstuvwxyz0123456789+/').split("");
        var fromChars = toChars.reduce(function (acc, chr, i) {
            acc[chr] = i;
            return acc;
        }, {});

        /*
		* In the following, three bytes are added together into a 24-bit
		* number, which is then split up in to 4 6-bit numbers - or vice versa.
		* That is why there is lots of shifting by multiples of 6 and 8, and
		* the magic numbers 3 and 4.
		*
		* The modulo 64 is for converting to base 64, and the modulo 256 is for
		* converting to 8-bit numbers.
		*/
        return {
            toBase64: function (ab) {
                var acc = [];

                var int8View = new Uint8Array(ab);
                var int8Index = 0, int24;
                for (; int8Index < int8View.length; int8Index += 3) {

                    // Grab three bytes
                    int24 =
						(int8View[int8Index + 0] << 16) +
						(int8View[int8Index + 1] << 8) +
						(int8View[int8Index + 2] << 0);

                    // Push four chars
                    acc.push(toChars[(int24 >> 18) % 64]);
                    acc.push(toChars[(int24 >> 12) % 64]);
                    acc.push(toChars[(int24 >> 6) % 64]);
                    acc.push(toChars[(int24 >> 0) % 64]);
                }

                // Set the last few characters to the padding character
                var padChars = 3 - ((ab.byteLength % 3) || 3);
                while (padChars--) {
                    acc[acc.length - padChars - 1] = pad;
                }

                return acc.join('');
            },

            fromBase64: function (base64) {
                var base64Len = base64.length;

                // Work out the length of the data, accommodating for padding
                var abLen = (base64Len / 4) * 3;
                if (base64.charAt(base64Len - 1) === pad) { abLen--; }
                if (base64.charAt(base64Len - 2) === pad) { abLen--; }

                // Make the ArrayBuffer, and an Int8Array to work with it
                var ab = new ArrayBuffer(abLen);
                var int8View = new Uint8Array(ab);

                var base64Index = 0, int8Index = 0, int24;
                for (; base64Index < base64Len; base64Index += 4, int8Index += 3) {

                    // Grab four chars
                    int24 =
						(fromChars[base64[base64Index + 0]] << 18) +
						(fromChars[base64[base64Index + 1]] << 12) +
						(fromChars[base64[base64Index + 2]] << 6) +
						(fromChars[base64[base64Index + 3]] << 0);

                    // Push three bytes
                    int8View[int8Index + 0] = (int24 >> 16) % 256;
                    int8View[int8Index + 1] = (int24 >> 8) % 256;
                    int8View[int8Index + 2] = (int24 >> 0) % 256;

                }

                return ab;
            }
        };
    })();

    xmlrpc.makeType('base64', true, function (ab) {
        return xmlrpc.binary.toBase64(ab);
    }, function (text) {
        return xmlrpc.binary.fromBase64(text);
    });

    // Nil/null
    xmlrpc.makeType('nil', false,
		function (val, $xml) { return $xml('ex:nil'); },
		function (_) { return null; }
	);

    // Structs/Objects
    xmlrpc.makeType('struct', false, function (value, $xml) {
        var $struct = $xml('struct');

        $.each(value, function (name, value) {
            var $name = $xml('name').text(name);
            var $value = $xml('value').append(xmlrpc.toXmlRpc(value, $xml));
            $struct.append($xml('member').append($name, $value));
        });

        return $struct;

    }, function (node) {
        return $(node)
			.find('> member')
			.toArray()
			.reduce(function (struct, el) {
			    var $el = $(el);
			    var key = $el.find('> name').text();
			    var value = xmlrpc.parseValue($el.find('> value'));

			    struct[key] = value;
			    return struct;
			}, {});

    });

    // Arrays
    xmlrpc.makeType('array', false, function (value, $xml) {
        var $array = $xml('array');
        var $data = $xml('data');
        $.each(value, function (i, val) {
            $data.append($xml('value').append(xmlrpc.toXmlRpc(val, $xml)));
        });
        $array.append($data);
        return $array;
    }, function (node) {
        return $(node).find('> data > value').toArray()
			.map(xmlrpc.parseValue);
    });


    /**
	* Force a value to an XML-RPC type. All the usual XML-RPC types are
	* supported
	*/
    xmlrpc.force = function (type, value) {
        return new xmlrpc.types[type](value);
    };

})(jQuery);
if ( window.XDomainRequest ) {
	jQuery.ajaxTransport(function( s ) {
		if ( s.crossDomain && s.async ) {
			if ( s.timeout ) {
				s.xdrTimeout = s.timeout;
				delete s.timeout;
			}
			var xdr;
			return {
				send: function( _, complete ) {
					function callback( status, statusText, responses, responseHeaders ) {
						xdr.onload = xdr.onerror = xdr.ontimeout = jQuery.noop;
						xdr = undefined;
						complete( status, statusText, responses, responseHeaders );
					}
					xdr = new XDomainRequest();
					xdr.onload = function() {
						callback( 200, "OK", { text: xdr.responseText }, "Content-Type: " + xdr.contentType );
					};
					xdr.onerror = function() {
						callback( 404, "Not Found" );
					};
					xdr.onprogress = jQuery.noop;
					xdr.ontimeout = function() {
						callback( 0, "timeout" );
					};
					xdr.timeout = s.xdrTimeout || Number.MAX_VALUE;
					xdr.open( s.type, s.url );
					xdr.send( ( s.hasContent && s.data ) || null );
				},
				abort: function() {
					if ( xdr ) {
						xdr.onerror = jQuery.noop;
						xdr.abort();
					}
				}
			};
		}
	});
}


!function(a,b){"function"==typeof define&&define.amd?define(["jquery"],function(a){return b(a)}):"object"==typeof exports?module.exports=b(require("jquery")):b(jQuery)}(this,function(a){!function(a){"use strict";function b(b){var c=[{re:/[\xC0-\xC6]/g,ch:"A"},{re:/[\xE0-\xE6]/g,ch:"a"},{re:/[\xC8-\xCB]/g,ch:"E"},{re:/[\xE8-\xEB]/g,ch:"e"},{re:/[\xCC-\xCF]/g,ch:"I"},{re:/[\xEC-\xEF]/g,ch:"i"},{re:/[\xD2-\xD6]/g,ch:"O"},{re:/[\xF2-\xF6]/g,ch:"o"},{re:/[\xD9-\xDC]/g,ch:"U"},{re:/[\xF9-\xFC]/g,ch:"u"},{re:/[\xC7-\xE7]/g,ch:"c"},{re:/[\xD1]/g,ch:"N"},{re:/[\xF1]/g,ch:"n"}];return a.each(c,function(){b=b.replace(this.re,this.ch)}),b}function c(a){var b={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#x27;","`":"&#x60;"},c="(?:"+Object.keys(b).join("|")+")",d=new RegExp(c),e=new RegExp(c,"g"),f=null==a?"":""+a;return d.test(f)?f.replace(e,function(a){return b[a]}):f}function d(b,c){var d=arguments,f=b,g=c;[].shift.apply(d);var h,i=this.each(function(){var b=a(this);if(b.is("select")){var c=b.data("selectpicker"),i="object"==typeof f&&f;if(c){if(i)for(var j in i)i.hasOwnProperty(j)&&(c.options[j]=i[j])}else{var k=a.extend({},e.DEFAULTS,a.fn.selectpicker.defaults||{},b.data(),i);k.template=a.extend({},e.DEFAULTS.template,a.fn.selectpicker.defaults?a.fn.selectpicker.defaults.template:{},b.data().template,i.template),b.data("selectpicker",c=new e(this,k,g))}"string"==typeof f&&(h=c[f]instanceof Function?c[f].apply(c,d):c.options[f])}});return"undefined"!=typeof h?h:i}String.prototype.includes||!function(){var a={}.toString,b=function(){try{var a={},b=Object.defineProperty,c=b(a,a,a)&&b}catch(d){}return c}(),c="".indexOf,d=function(b){if(null==this)throw new TypeError;var d=String(this);if(b&&"[object RegExp]"==a.call(b))throw new TypeError;var e=d.length,f=String(b),g=f.length,h=arguments.length>1?arguments[1]:void 0,i=h?Number(h):0;i!=i&&(i=0);var j=Math.min(Math.max(i,0),e);return g+j>e?!1:-1!=c.call(d,f,i)};b?b(String.prototype,"includes",{value:d,configurable:!0,writable:!0}):String.prototype.includes=d}(),String.prototype.startsWith||!function(){var a=function(){try{var a={},b=Object.defineProperty,c=b(a,a,a)&&b}catch(d){}return c}(),b={}.toString,c=function(a){if(null==this)throw new TypeError;var c=String(this);if(a&&"[object RegExp]"==b.call(a))throw new TypeError;var d=c.length,e=String(a),f=e.length,g=arguments.length>1?arguments[1]:void 0,h=g?Number(g):0;h!=h&&(h=0);var i=Math.min(Math.max(h,0),d);if(f+i>d)return!1;for(var j=-1;++j<f;)if(c.charCodeAt(i+j)!=e.charCodeAt(j))return!1;return!0};a?a(String.prototype,"startsWith",{value:c,configurable:!0,writable:!0}):String.prototype.startsWith=c}(),Object.keys||(Object.keys=function(a,b,c){c=[];for(b in a)c.hasOwnProperty.call(a,b)&&c.push(b);return c}),a.fn.triggerNative=function(a){var b,c=this[0];c.dispatchEvent?("function"==typeof Event?b=new Event(a,{bubbles:!0}):(b=document.createEvent("Event"),b.initEvent(a,!0,!1)),c.dispatchEvent(b)):(c.fireEvent&&(b=document.createEventObject(),b.eventType=a,c.fireEvent("on"+a,b)),this.trigger(a))},a.expr[":"].icontains=function(b,c,d){var e=a(b),f=(e.data("tokens")||e.text()).toUpperCase();return f.includes(d[3].toUpperCase())},a.expr[":"].ibegins=function(b,c,d){var e=a(b),f=(e.data("tokens")||e.text()).toUpperCase();return f.startsWith(d[3].toUpperCase())},a.expr[":"].aicontains=function(b,c,d){var e=a(b),f=(e.data("tokens")||e.data("normalizedText")||e.text()).toUpperCase();return f.includes(d[3].toUpperCase())},a.expr[":"].aibegins=function(b,c,d){var e=a(b),f=(e.data("tokens")||e.data("normalizedText")||e.text()).toUpperCase();return f.startsWith(d[3].toUpperCase())};var e=function(b,c,d){d&&(d.stopPropagation(),d.preventDefault()),this.$element=a(b),this.$newElement=null,this.$button=null,this.$menu=null,this.$lis=null,this.options=c,null===this.options.title&&(this.options.title=this.$element.attr("title")),this.val=e.prototype.val,this.render=e.prototype.render,this.refresh=e.prototype.refresh,this.setStyle=e.prototype.setStyle,this.selectAll=e.prototype.selectAll,this.deselectAll=e.prototype.deselectAll,this.destroy=e.prototype.destroy,this.remove=e.prototype.remove,this.show=e.prototype.show,this.hide=e.prototype.hide,this.init()};e.VERSION="1.10.0",e.DEFAULTS={noneSelectedText:"Nothing selected",noneResultsText:"No results matched {0}",countSelectedText:function(a,b){return 1==a?"{0} item selected":"{0} items selected"},maxOptionsText:function(a,b){return[1==a?"Limit reached ({n} item max)":"Limit reached ({n} items max)",1==b?"Group limit reached ({n} item max)":"Group limit reached ({n} items max)"]},selectAllText:"Select All",deselectAllText:"Deselect All",doneButton:!1,doneButtonText:"Close",multipleSeparator:", ",styleBase:"btn",style:"btn-default",size:"auto",title:null,selectedTextFormat:"values",width:!1,container:!1,hideDisabled:!1,showSubtext:!1,showIcon:!0,showContent:!0,dropupAuto:!0,header:!1,liveSearch:!1,liveSearchPlaceholder:null,liveSearchNormalize:!1,liveSearchStyle:"contains",actionsBox:!1,iconBase:"glyphicon",tickIcon:"glyphicon-ok",showTick:!1,template:{caret:'<span class="caret"></span>'},maxOptions:!1,mobile:!1,selectOnTab:!1,dropdownAlignRight:!1},e.prototype={constructor:e,init:function(){var b=this,c=this.$element.attr("id");this.$element.addClass("bs-select-hidden"),this.liObj={},this.multiple=this.$element.prop("multiple"),this.autofocus=this.$element.prop("autofocus"),this.$newElement=this.createView(),this.$element.after(this.$newElement).appendTo(this.$newElement),this.$button=this.$newElement.children("button"),this.$menu=this.$newElement.children(".dropdown-menu"),this.$menuInner=this.$menu.children(".inner"),this.$searchbox=this.$menu.find("input"),this.$element.removeClass("bs-select-hidden"),this.options.dropdownAlignRight&&this.$menu.addClass("dropdown-menu-right"),"undefined"!=typeof c&&(this.$button.attr("data-id",c),a('label[for="'+c+'"]').click(function(a){a.preventDefault(),b.$button.focus()})),this.checkDisabled(),this.clickListener(),this.options.liveSearch&&this.liveSearchListener(),this.render(),this.setStyle(),this.setWidth(),this.options.container&&this.selectPosition(),this.$menu.data("this",this),this.$newElement.data("this",this),this.options.mobile&&this.mobile(),this.$newElement.on({"hide.bs.dropdown":function(a){b.$element.trigger("hide.bs.select",a)},"hidden.bs.dropdown":function(a){b.$element.trigger("hidden.bs.select",a)},"show.bs.dropdown":function(a){b.$element.trigger("show.bs.select",a)},"shown.bs.dropdown":function(a){b.$element.trigger("shown.bs.select",a)}}),b.$element[0].hasAttribute("required")&&this.$element.on("invalid",function(){b.$button.addClass("bs-invalid").focus(),b.$element.on({"focus.bs.select":function(){b.$button.focus(),b.$element.off("focus.bs.select")},"shown.bs.select":function(){b.$element.val(b.$element.val()).off("shown.bs.select")},"rendered.bs.select":function(){this.validity.valid&&b.$button.removeClass("bs-invalid"),b.$element.off("rendered.bs.select")}})}),setTimeout(function(){b.$element.trigger("loaded.bs.select")})},createDropdown:function(){var b=this.multiple||this.options.showTick?" show-tick":"",d=this.$element.parent().hasClass("input-group")?" input-group-btn":"",e=this.autofocus?" autofocus":"",f=this.options.header?'<div class="popover-title"><button type="button" class="close" aria-hidden="true">&times;</button>'+this.options.header+"</div>":"",g=this.options.liveSearch?'<div class="bs-searchbox"><input type="text" class="form-control" autocomplete="off"'+(null===this.options.liveSearchPlaceholder?"":' placeholder="'+c(this.options.liveSearchPlaceholder)+'"')+"></div>":"",h=this.multiple&&this.options.actionsBox?'<div class="bs-actionsbox"><div class="btn-group btn-group-sm btn-block"><button type="button" class="actions-btn bs-select-all btn btn-default">'+this.options.selectAllText+'</button><button type="button" class="actions-btn bs-deselect-all btn btn-default">'+this.options.deselectAllText+"</button></div></div>":"",i=this.multiple&&this.options.doneButton?'<div class="bs-donebutton"><div class="btn-group btn-block"><button type="button" class="btn btn-sm btn-default">'+this.options.doneButtonText+"</button></div></div>":"",j='<div class="btn-group bootstrap-select'+b+d+'"><button type="button" class="'+this.options.styleBase+' dropdown-toggle" data-toggle="dropdown"'+e+'><span class="filter-option pull-left"></span>&nbsp;<span class="bs-caret">'+this.options.template.caret+'</span></button><div class="dropdown-menu open">'+f+g+h+'<ul class="dropdown-menu inner" role="menu"></ul>'+i+"</div></div>";return a(j)},createView:function(){var a=this.createDropdown(),b=this.createLi();return a.find("ul")[0].innerHTML=b,a},reloadLi:function(){this.destroyLi();var a=this.createLi();this.$menuInner[0].innerHTML=a},destroyLi:function(){this.$menu.find("li").remove()},createLi:function(){var d=this,e=[],f=0,g=document.createElement("option"),h=-1,i=function(a,b,c,d){return"<li"+("undefined"!=typeof c&""!==c?' class="'+c+'"':"")+("undefined"!=typeof b&null!==b?' data-original-index="'+b+'"':"")+("undefined"!=typeof d&null!==d?'data-optgroup="'+d+'"':"")+">"+a+"</li>"},j=function(a,e,f,g){return'<a tabindex="0"'+("undefined"!=typeof e?' class="'+e+'"':"")+("undefined"!=typeof f?' style="'+f+'"':"")+(d.options.liveSearchNormalize?' data-normalized-text="'+b(c(a))+'"':"")+("undefined"!=typeof g||null!==g?' data-tokens="'+g+'"':"")+">"+a+'<span class="'+d.options.iconBase+" "+d.options.tickIcon+' check-mark"></span></a>'};if(this.options.title&&!this.multiple&&(h--,!this.$element.find(".bs-title-option").length)){var k=this.$element[0];g.className="bs-title-option",g.appendChild(document.createTextNode(this.options.title)),g.value="",k.insertBefore(g,k.firstChild),void 0===a(k.options[k.selectedIndex]).attr("selected")&&(g.selected=!0)}return this.$element.find("option").each(function(b){var c=a(this);if(h++,!c.hasClass("bs-title-option")){var g=this.className||"",k=this.style.cssText,l=c.data("content")?c.data("content"):c.html(),m=c.data("tokens")?c.data("tokens"):null,n="undefined"!=typeof c.data("subtext")?'<small class="text-muted">'+c.data("subtext")+"</small>":"",o="undefined"!=typeof c.data("icon")?'<span class="'+d.options.iconBase+" "+c.data("icon")+'"></span> ':"",p="OPTGROUP"===this.parentNode.tagName,q=this.disabled||p&&this.parentNode.disabled;if(""!==o&&q&&(o="<span>"+o+"</span>"),d.options.hideDisabled&&q&&!p)return void h--;if(c.data("content")||(l=o+'<span class="text">'+l+n+"</span>"),p&&c.data("divider")!==!0){var r=" "+this.parentNode.className||"";if(0===c.index()){f+=1;var s=this.parentNode.label,t="undefined"!=typeof c.parent().data("subtext")?'<small class="text-muted">'+c.parent().data("subtext")+"</small>":"",u=c.parent().data("icon")?'<span class="'+d.options.iconBase+" "+c.parent().data("icon")+'"></span> ':"";s=u+'<span class="text">'+s+t+"</span>",0!==b&&e.length>0&&(h++,e.push(i("",null,"divider",f+"div"))),h++,e.push(i(s,null,"dropdown-header"+r,f))}if(d.options.hideDisabled&&q)return void h--;e.push(i(j(l,"opt "+g+r,k,m),b,"",f))}else c.data("divider")===!0?e.push(i("",b,"divider")):c.data("hidden")===!0?e.push(i(j(l,g,k,m),b,"hidden is-hidden")):(this.previousElementSibling&&"OPTGROUP"===this.previousElementSibling.tagName&&(h++,e.push(i("",null,"divider",f+"div"))),e.push(i(j(l,g,k,m),b)));d.liObj[b]=h}}),this.multiple||0!==this.$element.find("option:selected").length||this.options.title||this.$element.find("option").eq(0).prop("selected",!0).attr("selected","selected"),e.join("")},findLis:function(){return null==this.$lis&&(this.$lis=this.$menu.find("li")),this.$lis},render:function(b){var c,d=this;b!==!1&&this.$element.find("option").each(function(a){var b=d.findLis().eq(d.liObj[a]);d.setDisabled(a,this.disabled||"OPTGROUP"===this.parentNode.tagName&&this.parentNode.disabled,b),d.setSelected(a,this.selected,b)}),this.tabIndex();var e=this.$element.find("option").map(function(){if(this.selected){if(d.options.hideDisabled&&(this.disabled||"OPTGROUP"===this.parentNode.tagName&&this.parentNode.disabled))return;var b,c=a(this),e=c.data("icon")&&d.options.showIcon?'<i class="'+d.options.iconBase+" "+c.data("icon")+'"></i> ':"";return b=d.options.showSubtext&&c.data("subtext")&&!d.multiple?' <small class="text-muted">'+c.data("subtext")+"</small>":"","undefined"!=typeof c.attr("title")?c.attr("title"):c.data("content")&&d.options.showContent?c.data("content"):e+c.html()+b}}).toArray(),f=this.multiple?e.join(this.options.multipleSeparator):e[0];if(this.multiple&&this.options.selectedTextFormat.indexOf("count")>-1){var g=this.options.selectedTextFormat.split(">");if(g.length>1&&e.length>g[1]||1==g.length&&e.length>=2){c=this.options.hideDisabled?", [disabled]":"";var h=this.$element.find("option").not('[data-divider="true"], [data-hidden="true"]'+c).length,i="function"==typeof this.options.countSelectedText?this.options.countSelectedText(e.length,h):this.options.countSelectedText;f=i.replace("{0}",e.length.toString()).replace("{1}",h.toString())}}void 0==this.options.title&&(this.options.title=this.$element.attr("title")),"static"==this.options.selectedTextFormat&&(f=this.options.title),f||(f="undefined"!=typeof this.options.title?this.options.title:this.options.noneSelectedText),this.$button.attr("title",a.trim(f.replace(/<[^>]*>?/g,""))),this.$button.children(".filter-option").html(f),this.$element.trigger("rendered.bs.select")},setStyle:function(a,b){this.$element.attr("class")&&this.$newElement.addClass(this.$element.attr("class").replace(/selectpicker|mobile-device|bs-select-hidden|validate\[.*\]/gi,""));var c=a?a:this.options.style;"add"==b?this.$button.addClass(c):"remove"==b?this.$button.removeClass(c):(this.$button.removeClass(this.options.style),this.$button.addClass(c))},liHeight:function(b){if(b||this.options.size!==!1&&!this.sizeInfo){var c=document.createElement("div"),d=document.createElement("div"),e=document.createElement("ul"),f=document.createElement("li"),g=document.createElement("li"),h=document.createElement("a"),i=document.createElement("span"),j=this.options.header&&this.$menu.find(".popover-title").length>0?this.$menu.find(".popover-title")[0].cloneNode(!0):null,k=this.options.liveSearch?document.createElement("div"):null,l=this.options.actionsBox&&this.multiple&&this.$menu.find(".bs-actionsbox").length>0?this.$menu.find(".bs-actionsbox")[0].cloneNode(!0):null,m=this.options.doneButton&&this.multiple&&this.$menu.find(".bs-donebutton").length>0?this.$menu.find(".bs-donebutton")[0].cloneNode(!0):null;if(i.className="text",c.className=this.$menu[0].parentNode.className+" open",d.className="dropdown-menu open",e.className="dropdown-menu inner",f.className="divider",i.appendChild(document.createTextNode("Inner text")),h.appendChild(i),g.appendChild(h),e.appendChild(g),e.appendChild(f),j&&d.appendChild(j),k){var n=document.createElement("span");k.className="bs-searchbox",n.className="form-control",k.appendChild(n),d.appendChild(k)}l&&d.appendChild(l),d.appendChild(e),m&&d.appendChild(m),c.appendChild(d),document.body.appendChild(c);var o=h.offsetHeight,p=j?j.offsetHeight:0,q=k?k.offsetHeight:0,r=l?l.offsetHeight:0,s=m?m.offsetHeight:0,t=a(f).outerHeight(!0),u="function"==typeof getComputedStyle?getComputedStyle(d):!1,v=u?null:a(d),w=parseInt(u?u.paddingTop:v.css("paddingTop"))+parseInt(u?u.paddingBottom:v.css("paddingBottom"))+parseInt(u?u.borderTopWidth:v.css("borderTopWidth"))+parseInt(u?u.borderBottomWidth:v.css("borderBottomWidth")),x=w+parseInt(u?u.marginTop:v.css("marginTop"))+parseInt(u?u.marginBottom:v.css("marginBottom"))+2;document.body.removeChild(c),this.sizeInfo={liHeight:o,headerHeight:p,searchHeight:q,actionsHeight:r,doneButtonHeight:s,dividerHeight:t,menuPadding:w,menuExtras:x}}},setSize:function(){if(this.findLis(),this.liHeight(),this.options.header&&this.$menu.css("padding-top",0),this.options.size!==!1){var b,c,d,e,f=this,g=this.$menu,h=this.$menuInner,i=a(window),j=this.$newElement[0].offsetHeight,k=this.sizeInfo.liHeight,l=this.sizeInfo.headerHeight,m=this.sizeInfo.searchHeight,n=this.sizeInfo.actionsHeight,o=this.sizeInfo.doneButtonHeight,p=this.sizeInfo.dividerHeight,q=this.sizeInfo.menuPadding,r=this.sizeInfo.menuExtras,s=this.options.hideDisabled?".disabled":"",t=function(){d=f.$newElement.offset().top-i.scrollTop(),e=i.height()-d-j};if(t(),"auto"===this.options.size){var u=function(){var i,j=function(b,c){return function(d){return c?d.classList?d.classList.contains(b):a(d).hasClass(b):!(d.classList?d.classList.contains(b):a(d).hasClass(b))}},p=f.$menuInner[0].getElementsByTagName("li"),s=Array.prototype.filter?Array.prototype.filter.call(p,j("hidden",!1)):f.$lis.not(".hidden"),u=Array.prototype.filter?Array.prototype.filter.call(s,j("dropdown-header",!0)):s.filter(".dropdown-header");t(),b=e-r,f.options.container?(g.data("height")||g.data("height",g.height()),c=g.data("height")):c=g.height(),f.options.dropupAuto&&f.$newElement.toggleClass("dropup",d>e&&c>b-r),f.$newElement.hasClass("dropup")&&(b=d-r),i=s.length+u.length>3?3*k+r-2:0,g.css({"max-height":b+"px",overflow:"hidden","min-height":i+l+m+n+o+"px"}),h.css({"max-height":b-l-m-n-o-q+"px","overflow-y":"auto","min-height":Math.max(i-q,0)+"px"})};u(),this.$searchbox.off("input.getSize propertychange.getSize").on("input.getSize propertychange.getSize",u),i.off("resize.getSize scroll.getSize").on("resize.getSize scroll.getSize",u)}else if(this.options.size&&"auto"!=this.options.size&&this.$lis.not(s).length>this.options.size){var v=this.$lis.not(".divider").not(s).children().slice(0,this.options.size).last().parent().index(),w=this.$lis.slice(0,v+1).filter(".divider").length;b=k*this.options.size+w*p+q,f.options.container?(g.data("height")||g.data("height",g.height()),c=g.data("height")):c=g.height(),f.options.dropupAuto&&this.$newElement.toggleClass("dropup",d>e&&c>b-r),g.css({"max-height":b+l+m+n+o+"px",overflow:"hidden","min-height":""}),h.css({"max-height":b-q+"px","overflow-y":"auto","min-height":""})}}},setWidth:function(){if("auto"===this.options.width){this.$menu.css("min-width","0");var a=this.$menu.parent().clone().appendTo("body"),b=this.options.container?this.$newElement.clone().appendTo("body"):a,c=a.children(".dropdown-menu").outerWidth(),d=b.css("width","auto").children("button").outerWidth();a.remove(),b.remove(),this.$newElement.css("width",Math.max(c,d)+"px")}else"fit"===this.options.width?(this.$menu.css("min-width",""),this.$newElement.css("width","").addClass("fit-width")):this.options.width?(this.$menu.css("min-width",""),this.$newElement.css("width",this.options.width)):(this.$menu.css("min-width",""),this.$newElement.css("width",""));this.$newElement.hasClass("fit-width")&&"fit"!==this.options.width&&this.$newElement.removeClass("fit-width")},selectPosition:function(){this.$bsContainer=a('<div class="bs-container" />');var b,c,d=this,e=function(a){d.$bsContainer.addClass(a.attr("class").replace(/form-control|fit-width/gi,"")).toggleClass("dropup",a.hasClass("dropup")),b=a.offset(),c=a.hasClass("dropup")?0:a[0].offsetHeight,d.$bsContainer.css({top:b.top+c,left:b.left,width:a[0].offsetWidth})};this.$button.on("click",function(){var b=a(this);d.isDisabled()||(e(d.$newElement),d.$bsContainer.appendTo(d.options.container).toggleClass("open",!b.hasClass("open")).append(d.$menu))}),a(window).on("resize scroll",function(){e(d.$newElement)}),this.$element.on("hide.bs.select",function(){d.$menu.data("height",d.$menu.height()),d.$bsContainer.detach()})},setSelected:function(a,b,c){c||(c=this.findLis().eq(this.liObj[a])),c.toggleClass("selected",b)},setDisabled:function(a,b,c){c||(c=this.findLis().eq(this.liObj[a])),b?c.addClass("disabled").children("a").attr("href","#").attr("tabindex",-1):c.removeClass("disabled").children("a").removeAttr("href").attr("tabindex",0)},isDisabled:function(){return this.$element[0].disabled},checkDisabled:function(){var a=this;this.isDisabled()?(this.$newElement.addClass("disabled"),this.$button.addClass("disabled").attr("tabindex",-1)):(this.$button.hasClass("disabled")&&(this.$newElement.removeClass("disabled"),this.$button.removeClass("disabled")),-1!=this.$button.attr("tabindex")||this.$element.data("tabindex")||this.$button.removeAttr("tabindex")),this.$button.click(function(){return!a.isDisabled()})},tabIndex:function(){this.$element.data("tabindex")!==this.$element.attr("tabindex")&&-98!==this.$element.attr("tabindex")&&"-98"!==this.$element.attr("tabindex")&&(this.$element.data("tabindex",this.$element.attr("tabindex")),this.$button.attr("tabindex",this.$element.data("tabindex"))),this.$element.attr("tabindex",-98)},clickListener:function(){var b=this,c=a(document);this.$newElement.on("touchstart.dropdown",".dropdown-menu",function(a){a.stopPropagation()}),c.data("spaceSelect",!1),this.$button.on("keyup",function(a){/(32)/.test(a.keyCode.toString(10))&&c.data("spaceSelect")&&(a.preventDefault(),c.data("spaceSelect",!1))}),this.$button.on("click",function(){b.setSize()}),this.$element.on("shown.bs.select",function(){if(b.options.liveSearch||b.multiple){if(!b.multiple){var a=b.liObj[b.$element[0].selectedIndex];if("number"!=typeof a||b.options.size===!1)return;var c=b.$lis.eq(a)[0].offsetTop-b.$menuInner[0].offsetTop;c=c-b.$menuInner[0].offsetHeight/2+b.sizeInfo.liHeight/2,b.$menuInner[0].scrollTop=c}}else b.$menuInner.find(".selected a").focus()}),this.$menuInner.on("click","li a",function(c){var d=a(this),e=d.parent().data("originalIndex"),f=b.$element.val(),g=b.$element.prop("selectedIndex");if(b.multiple&&c.stopPropagation(),c.preventDefault(),!b.isDisabled()&&!d.parent().hasClass("disabled")){var h=b.$element.find("option"),i=h.eq(e),j=i.prop("selected"),k=i.parent("optgroup"),l=b.options.maxOptions,m=k.data("maxOptions")||!1;if(b.multiple){if(i.prop("selected",!j),b.setSelected(e,!j),d.blur(),l!==!1||m!==!1){var n=l<h.filter(":selected").length,o=m<k.find("option:selected").length;if(l&&n||m&&o)if(l&&1==l)h.prop("selected",!1),i.prop("selected",!0),b.$menuInner.find(".selected").removeClass("selected"),b.setSelected(e,!0);else if(m&&1==m){k.find("option:selected").prop("selected",!1),i.prop("selected",!0);var p=d.parent().data("optgroup");b.$menuInner.find('[data-optgroup="'+p+'"]').removeClass("selected"),b.setSelected(e,!0)}else{var q="function"==typeof b.options.maxOptionsText?b.options.maxOptionsText(l,m):b.options.maxOptionsText,r=q[0].replace("{n}",l),s=q[1].replace("{n}",m),t=a('<div class="notify"></div>');q[2]&&(r=r.replace("{var}",q[2][l>1?0:1]),s=s.replace("{var}",q[2][m>1?0:1])),i.prop("selected",!1),b.$menu.append(t),l&&n&&(t.append(a("<div>"+r+"</div>")),b.$element.trigger("maxReached.bs.select")),m&&o&&(t.append(a("<div>"+s+"</div>")),b.$element.trigger("maxReachedGrp.bs.select")),setTimeout(function(){b.setSelected(e,!1)},10),t.delay(750).fadeOut(300,function(){a(this).remove()})}}}else h.prop("selected",!1),i.prop("selected",!0),b.$menuInner.find(".selected").removeClass("selected"),b.setSelected(e,!0);b.multiple?b.options.liveSearch&&b.$searchbox.focus():b.$button.focus(),(f!=b.$element.val()&&b.multiple||g!=b.$element.prop("selectedIndex")&&!b.multiple)&&b.$element.trigger("changed.bs.select",[e,i.prop("selected"),j]).triggerNative("change")}}),this.$menu.on("click","li.disabled a, .popover-title, .popover-title :not(.close)",function(c){c.currentTarget==this&&(c.preventDefault(),c.stopPropagation(),b.options.liveSearch&&!a(c.target).hasClass("close")?b.$searchbox.focus():b.$button.focus())}),this.$menuInner.on("click",".divider, .dropdown-header",function(a){a.preventDefault(),a.stopPropagation(),b.options.liveSearch?b.$searchbox.focus():b.$button.focus()}),this.$menu.on("click",".popover-title .close",function(){b.$button.click()}),this.$searchbox.on("click",function(a){a.stopPropagation()}),this.$menu.on("click",".actions-btn",function(c){b.options.liveSearch?b.$searchbox.focus():b.$button.focus(),c.preventDefault(),c.stopPropagation(),a(this).hasClass("bs-select-all")?b.selectAll():b.deselectAll()}),this.$element.change(function(){b.render(!1)})},liveSearchListener:function(){var d=this,e=a('<li class="no-results"></li>');this.$button.on("click.dropdown.data-api touchstart.dropdown.data-api",function(){d.$menuInner.find(".active").removeClass("active"),d.$searchbox.val()&&(d.$searchbox.val(""),d.$lis.not(".is-hidden").removeClass("hidden"),e.parent().length&&e.remove()),d.multiple||d.$menuInner.find(".selected").addClass("active"),setTimeout(function(){d.$searchbox.focus()},10)}),this.$searchbox.on("click.dropdown.data-api focus.dropdown.data-api touchend.dropdown.data-api",function(a){a.stopPropagation()}),this.$searchbox.on("input propertychange",function(){if(d.$searchbox.val()){var f=d.$lis.not(".is-hidden").removeClass("hidden").children("a");f=d.options.liveSearchNormalize?f.not(":a"+d._searchStyle()+'("'+b(d.$searchbox.val())+'")'):f.not(":"+d._searchStyle()+'("'+d.$searchbox.val()+'")'),f.parent().addClass("hidden"),d.$lis.filter(".dropdown-header").each(function(){var b=a(this),c=b.data("optgroup");0===d.$lis.filter("[data-optgroup="+c+"]").not(b).not(".hidden").length&&(b.addClass("hidden"),d.$lis.filter("[data-optgroup="+c+"div]").addClass("hidden"))});var g=d.$lis.not(".hidden");g.each(function(b){var c=a(this);c.hasClass("divider")&&(c.index()===g.first().index()||c.index()===g.last().index()||g.eq(b+1).hasClass("divider"))&&c.addClass("hidden")}),d.$lis.not(".hidden, .no-results").length?e.parent().length&&e.remove():(e.parent().length&&e.remove(),e.html(d.options.noneResultsText.replace("{0}",'"'+c(d.$searchbox.val())+'"')).show(),d.$menuInner.append(e))}else d.$lis.not(".is-hidden").removeClass("hidden"),e.parent().length&&e.remove();d.$lis.filter(".active").removeClass("active"),d.$searchbox.val()&&d.$lis.not(".hidden, .divider, .dropdown-header").eq(0).addClass("active").children("a").focus(),a(this).focus()})},_searchStyle:function(){var a={begins:"ibegins",startsWith:"ibegins"};return a[this.options.liveSearchStyle]||"icontains"},val:function(a){return"undefined"!=typeof a?(this.$element.val(a),this.render(),this.$element):this.$element.val()},changeAll:function(b){"undefined"==typeof b&&(b=!0),this.findLis();for(var c=this.$element.find("option"),d=this.$lis.not(".divider, .dropdown-header, .disabled, .hidden").toggleClass("selected",b),e=d.length,f=[],g=0;e>g;g++){var h=d[g].getAttribute("data-original-index");f[f.length]=c.eq(h)[0]}a(f).prop("selected",b),this.render(!1),this.$element.trigger("changed.bs.select").triggerNative("change")},selectAll:function(){return this.changeAll(!0)},deselectAll:function(){return this.changeAll(!1)},toggle:function(a){a=a||window.event,a&&a.stopPropagation(),this.$button.trigger("click")},keydown:function(c){var d,e,f,g,h,i,j,k,l,m=a(this),n=m.is("input")?m.parent().parent():m.parent(),o=n.data("this"),p=":not(.disabled, .hidden, .dropdown-header, .divider)",q={32:" ",48:"0",49:"1",50:"2",51:"3",52:"4",53:"5",54:"6",55:"7",56:"8",57:"9",59:";",65:"a",66:"b",67:"c",68:"d",69:"e",70:"f",71:"g",72:"h",73:"i",74:"j",75:"k",76:"l",77:"m",78:"n",79:"o",80:"p",81:"q",82:"r",83:"s",84:"t",85:"u",86:"v",87:"w",88:"x",89:"y",90:"z",96:"0",97:"1",98:"2",99:"3",100:"4",101:"5",102:"6",103:"7",104:"8",105:"9"};if(o.options.liveSearch&&(n=m.parent().parent()),o.options.container&&(n=o.$menu),d=a("[role=menu] li",n),l=o.$newElement.hasClass("open"),!l&&(c.keyCode>=48&&c.keyCode<=57||c.keyCode>=96&&c.keyCode<=105||c.keyCode>=65&&c.keyCode<=90)&&(o.options.container?o.$button.trigger("click"):(o.setSize(),o.$menu.parent().addClass("open"),l=!0),o.$searchbox.focus()),o.options.liveSearch&&(/(^9$|27)/.test(c.keyCode.toString(10))&&l&&0===o.$menu.find(".active").length&&(c.preventDefault(),o.$menu.parent().removeClass("open"),o.options.container&&o.$newElement.removeClass("open"),o.$button.focus()),d=a("[role=menu] li"+p,n),m.val()||/(38|40)/.test(c.keyCode.toString(10))||0===d.filter(".active").length&&(d=o.$menuInner.find("li"),d=o.options.liveSearchNormalize?d.filter(":a"+o._searchStyle()+"("+b(q[c.keyCode])+")"):d.filter(":"+o._searchStyle()+"("+q[c.keyCode]+")"))),d.length){if(/(38|40)/.test(c.keyCode.toString(10)))e=d.index(d.find("a").filter(":focus").parent()),g=d.filter(p).first().index(),h=d.filter(p).last().index(),f=d.eq(e).nextAll(p).eq(0).index(),i=d.eq(e).prevAll(p).eq(0).index(),j=d.eq(f).prevAll(p).eq(0).index(),o.options.liveSearch&&(d.each(function(b){a(this).hasClass("disabled")||a(this).data("index",b)}),e=d.index(d.filter(".active")),g=d.first().data("index"),h=d.last().data("index"),f=d.eq(e).nextAll().eq(0).data("index"),i=d.eq(e).prevAll().eq(0).data("index"),j=d.eq(f).prevAll().eq(0).data("index")),k=m.data("prevIndex"),38==c.keyCode?(o.options.liveSearch&&e--,e!=j&&e>i&&(e=i),g>e&&(e=g),e==k&&(e=h)):40==c.keyCode&&(o.options.liveSearch&&e++,-1==e&&(e=0),e!=j&&f>e&&(e=f),e>h&&(e=h),e==k&&(e=g)),m.data("prevIndex",e),o.options.liveSearch?(c.preventDefault(),m.hasClass("dropdown-toggle")||(d.removeClass("active").eq(e).addClass("active").children("a").focus(),m.focus())):d.eq(e).children("a").focus();else if(!m.is("input")){var r,s,t=[];d.each(function(){a(this).hasClass("disabled")||a.trim(a(this).children("a").text().toLowerCase()).substring(0,1)==q[c.keyCode]&&t.push(a(this).index())}),r=a(document).data("keycount"),r++,a(document).data("keycount",r),s=a.trim(a(":focus").text().toLowerCase()).substring(0,1),s!=q[c.keyCode]?(r=1,a(document).data("keycount",r)):r>=t.length&&(a(document).data("keycount",0),r>t.length&&(r=1)),d.eq(t[r-1]).children("a").focus()}if((/(13|32)/.test(c.keyCode.toString(10))||/(^9$)/.test(c.keyCode.toString(10))&&o.options.selectOnTab)&&l){if(/(32)/.test(c.keyCode.toString(10))||c.preventDefault(),o.options.liveSearch)/(32)/.test(c.keyCode.toString(10))||(o.$menuInner.find(".active a").click(),m.focus());else{var u=a(":focus");u.click(),u.focus(),c.preventDefault(),a(document).data("spaceSelect",!0)}a(document).data("keycount",0)}(/(^9$|27)/.test(c.keyCode.toString(10))&&l&&(o.multiple||o.options.liveSearch)||/(27)/.test(c.keyCode.toString(10))&&!l)&&(o.$menu.parent().removeClass("open"),o.options.container&&o.$newElement.removeClass("open"),o.$button.focus())}},mobile:function(){this.$element.addClass("mobile-device")},refresh:function(){this.$lis=null,this.liObj={},this.reloadLi(),this.render(),this.checkDisabled(),this.liHeight(!0),this.setStyle(),this.setWidth(),this.$lis&&this.$searchbox.trigger("propertychange"),this.$element.trigger("refreshed.bs.select")},hide:function(){this.$newElement.hide()},show:function(){this.$newElement.show()},remove:function(){this.$newElement.remove(),this.$element.remove()},destroy:function(){this.$newElement.before(this.$element).remove(),this.$bsContainer?this.$bsContainer.remove():this.$menu.remove(),this.$element.off(".bs.select").removeData("selectpicker").removeClass("bs-select-hidden selectpicker")}};var f=a.fn.selectpicker;a.fn.selectpicker=d,a.fn.selectpicker.Constructor=e,a.fn.selectpicker.noConflict=function(){return a.fn.selectpicker=f,this},a(document).data("keycount",0).on("keydown.bs.select",'.bootstrap-select [data-toggle=dropdown], .bootstrap-select [role="menu"], .bs-searchbox input',e.prototype.keydown).on("focusin.modal",'.bootstrap-select [data-toggle=dropdown], .bootstrap-select [role="menu"], .bs-searchbox input',function(a){a.stopPropagation()}),a(window).on("load.bs.select.data-api",function(){a(".selectpicker").each(function(){var b=a(this);d.call(b,b.data())})})}(a)});

/* =============================================================
 * kueri.searchconnect.js 
 * ============================================================ */

var Kueri = Kueri || {};
Kueri.SearchConnect = function (options) {

	this.SUGGEST_QUERY = "QUERY";
	this.SUGGEST_TO_RUN = "INPUT_SENTENCE";
	this.SUGGEST_UNSUPPORTED = "UNSUPPORTED";
	this.SUGGEST_AMBIGUITY = "AMBIGUITY_MSG";
	this.SERVICE_UNAVAILABLE = "UNAVAILABLE";

	var defaults = {
		receiveResults: true,
		receiveJson: false,
		batchSize: 200,
		pageSize: 20,
		requestUrl: "http://dev.simpleql.com/a/xmlrpc",
		downloadCsvUrl: "http://dev.simpleql.com/a/download",
		token: 'anonymous',
		databaseId: 199,
		multipleDatabases: false,
		debug: false,
		beforeRunQuery: function () { },
		queryStarted: function () { },
		queryStopped: function () { },
		queryResponseReceived: function () { },
		aborted: function () { },
		errorReceived: function () { }
	};

	this.settings = $.extend({}, defaults, options);
	this.clientQueryId = 0;
	this.lastQuery = null;
	this.lastBatch = null;
	this.lastErrorId = 0;
	this.xhr = null;
	this.xhrSubmit = null;
};

Kueri.SearchConnect.prototype = {
	constructor: Kueri.SearchConnect,
		
	getDatabases: function (process, sync) {
		if (!this.settings.token)
			return;

		var success = function (json) {
			if (json && json.status == "ok") {
				var databases = json.dbs ? $.map(json.dbs, function (val, i) {
					return {
						id: val.i,
						name: val.n,
						develop: val.d
					};
				}) : [];
				process(databases);

			} else {
				process([]);
			}
		};

		this._xmlRpc(success, 'server.getUserDatabases', [this.settings.token], null, sync);
	},
		
	getPage: function (page, sorting) {
		if (this.lastQuery) {

			var from = (page - 1) * this.settings.pageSize + 1;
			var to = page * this.settings.pageSize;

			var batch = $.extend(true, {}, this.lastBatch || {}); //clone

			if (this.lastBatch
				&& (from >= batch.results.from)
				&& (Math.min(to, batch.results.total) <= (batch.results.from + this.settings.batchSize - 1))) {

				this.abort();
				this._submitSuggestionSuccess(batch, from);
			} else {
				this.submitSuggestion(self, this.lastQuery.query, this.lastQuery.keywords, from,
					this.lastQuery.columnNames, this.lastQuery.columnId, this.lastQuery.rowData, false, sorting || this.lastQuery.sorting);
			}
		}
	},

	runDrillDown: function (column, row, sorting) {
		if (this.lastQuery && arguments.length >= 2) {

			var rowData = $.isArray(row) ? row : $.map(row, function (prop) {
				if (JSON.stringify(prop) == "null")
					return [prop];

				return [JSON.stringify(prop).substr(1, JSON.stringify(prop).length - 2)];
			});
			var columnNames = $.merge($.merge([], this.lastQuery.columnNames || []), [column.n]);
			this.submitSuggestion(self, this.lastQuery.query, this.lastQuery.keywords, 1, columnNames, column.id, rowData, false, sorting);
		}
	},

	runDrillUp: function (column, row, sorting) {
		this.lastBatch = null;
		if (this.lastQuery && arguments.length >= 2) {

			var rowData = $.map(row, function (prop) { return prop; });
			var columnNames = this.lastQuery.columnNames.length <= 1 ? null : this.lastQuery.columnNames.slice(0, this.lastQuery.columnNames.length - 1);

			this.lastQuery.columnId = column.id;
			this.lastQuery.rowData = rowData;
			this.lastQuery.columnNames = columnNames;
			this.lastQuery.sorting = sorting;

			return {
				databaseId: (this.settings.multipleDatabases) ? this.settings.databaseId : null,
				queryText: this.lastQuery.displayQuery,
				auto: this.lastQuery.auto,
				queryData: $.extend(true, {}, this.lastQuery || {}),
				isDrillDown: this.lastQuery.columnNames
					&& $.isArray(this.lastQuery.columnNames)
					&& this.lastQuery.rowData
					&& $.isArray(this.lastQuery.rowData)
					&& $.isNumeric(this.lastQuery.columnId)
			};
		}

		return null;
	},

	sort: function (sorting) {
		if (this.lastQuery) {
			this.submitSuggestion(this, this.lastQuery.query, this.lastQuery.keywords, null,
					this.lastQuery.columnNames, this.lastQuery.columnId, this.lastQuery.rowData, false, sorting);
		}
	},

	downloadCsv: function () {
		if (!this.settings.token)
			return;

		if (this.lastQuery) {
			var data = { "token": this.settings.token, "dbId": this.settings.databaseId, "query": this.lastQuery.query };


			if (this.lastQuery.sorting) {
				data["extra"] = this.lastQuery.sorting;
			}

			var isDrillDown = this.lastQuery.columnNames && $.isArray(this.lastQuery.columnNames)
				&& this.lastQuery.rowData && $.isArray(this.lastQuery.rowData) && $.isNumeric(this.lastQuery.columnId);
			if (isDrillDown) {
				data["columnNames"] = this.lastQuery.columnNames;
				data["columnId"] = this.lastQuery.columnId;
				data["row"] = this.lastQuery.rowData;
			}

			this._fullJsonPost(this.settings.downloadCsvUrl, JSON.stringify(data));
		}
	},

	changeDatabase: function (databaseId) {
		this.settings.databaseId = parseInt(databaseId);
	},

	setToken: function (token) {
		this.settings.token = token;
	},
		
	getSuggestions: function (context, query, process, isEnter) {
		var self = this;
		if (!self.settings.token)
			return;

		var success = function (json) {
			if (json && json.status == "ok") {

				var suggests = json.suggests ? $.map(json.suggests, function (val, i) {
					return {
						text: val.s,
						query: val.c || val.s,
						type: val.t || self.SUGGEST_TO_RUN
					};
				}) : [];

				if (json.msgId == 4) {
					suggests.unshift({ text: json.msg, type: self.SUGGEST_AMBIGUITY });
				}

				if (json.msgId == 5 && !suggests.length) {
					suggests = [{ text: json.msg, type: self.SUGGEST_UNSUPPORTED }];
				}

				var ignore = json.ignoredElements ? $.map(json.ignoredElements, function (val, i) {
					return val;
				}) : [];

				if (json.id === self.clientQueryId) {
					process({
						query: query,
						suggests: suggests,
						ignore: ignore,
						ambiguity: json.msgId == 4,
						outOfScope: json.msgId == 5,
						showIgnoredOption: json.msgId == 6
					});
				}
			}
			else if (json && json.status == "not supported") {

				if (json.id === self.clientQueryId) {
					process({
						query: query,
						suggests: [{
							text: json.msg,
							type: self.SUGGEST_UNSUPPORTED
						}],
						ignore: []
					});
				}
			}
			else if (json && json.status == self.SERVICE_UNAVAILABLE) {

				if (json.id === self.clientQueryId) {
					process({
						query: query,
						suggests: [{
							text: "<i class='fa fa-exclamation-triangle'></i> Service unavailable, try again shortly <span class='receive-suggestions'>Retry now</span>",
							type: self.SERVICE_UNAVAILABLE
						}],
						ignore: []
					});
				}
			}
		};

		self.clientQueryId++;

		var params = [self.settings.token, self.settings.databaseId, query.query1];
		if (isEnter) {
			params.push(true);
		}
		else if (query.query2.length) {
			params.push(query.query2);
		}
			
		params.push(self.clientQueryId);
		self.xhr = self._xmlRpc(success, 'server.getKeywordSuggestions', params);
	},

	submitSuggestion: function (context, query, keywords, from, columnNames, columnId, rowData, hidden, sorting) {
		var self = this;
		if (!self.settings.token)
			return;
		this.abort();

		sorting = (sorting && !sorting.length) ? null : sorting;

		var pageQuery = from > 1;
		from = from || 1;
		var success = function (json) {
			self.xhrSubmit = null;
			self.settings.queryStopped();
			if (json && json.status == "ok") {

				if ((pageQuery || sorting) && self.settings.receiveResults && json.queries.length && self.lastBatch) {
					json.results.total = self.lastBatch.results.total;
				}

				self.lastBatch = $.extend(true, {}, json); //clone
				self._submitSuggestionSuccess(json, from);
			}
		};

		var submittingArgs = { query: query };
		this.settings.beforeRunQuery(submittingArgs);

		self.lastQuery = {
			query: query,
			displayQuery: submittingArgs.query,
			keywords: keywords,
			columnNames: columnNames,
			columnId: columnId,
			rowData: rowData,
			auto: hidden,
			sorting: sorting
		};

		var q1 = $("<div />").html(submittingArgs.query).text();
		var rpcParams = { method: "", parameters: [] };

		var isDrillDown = columnNames && $.isArray(columnNames) && rowData && $.isArray(rowData) && $.isNumeric(columnId);

		if (self.settings.receiveResults) {
			rpcParams.method = 'server.getResults';
			rpcParams.parameters = [self.settings.token, self.settings.databaseId];
			if (!isDrillDown && !sorting && keywords) {
				rpcParams.parameters.push(keywords);
			}

			rpcParams.parameters.push(q1);

			if (isDrillDown) {
				rpcParams.parameters.push(columnNames);
				rpcParams.parameters.push(columnId);
				rpcParams.parameters.push(rowData);
			}

			rpcParams.parameters.push(from);
			rpcParams.parameters.push(self.settings.batchSize);
			if (sorting) {
				rpcParams.parameters.push(sorting);
			}
		} else if (self.settings.receiveJson) {
			rpcParams.method = 'server.getJson';
			rpcParams.parameters = [self.settings.token, self.settings.databaseId];
			if (keywords) {
				rpcParams.parameters.push(keywords);
			}
			rpcParams.parameters.push(q1);
		} else {
			rpcParams.method = 'server.getSql';
			rpcParams.parameters = [self.settings.token, self.settings.databaseId, q1];
		}

		if (!hidden) {
			self.settings.queryStarted();
		}
		self.xhrSubmit = self._xmlRpc(success, rpcParams.method, rpcParams.parameters);
		self.xhrSubmit.silent = hidden;

		if (self.settings.debug) {

			rpcParams.parameters = [self.settings.token, self.settings.databaseId, q1];

			if (isDrillDown) {
				rpcParams.parameters.push(columnNames);
			}

			self._xmlRpc(function (json) {

				if (json && json.status == "ok") {
					setTimeout(function () {
						console.log(json.queries[0].q);
					}, 0);
				}

			}, 'server.getSql', rpcParams.parameters);
		}
	},

	_submitSuggestionSuccess: function (json, from) {
		var self = this;
		setTimeout(function () {
			var data = {
				query: json.queries || [],
				databaseId: (self.settings.multipleDatabases) ? self.settings.databaseId : null,
				tooManyColumns: json.message && json.message.s == 'TOO_MANY_COLUMNS',
				queryText: self.lastQuery.displayQuery,
				queryRan: !self.lastQuery.keywords ? self.lastQuery.displayQuery : null,
				auto: self.lastQuery.auto,
				queryData: $.extend(true, {}, self.lastQuery || {}),
				isDrillDown: self.lastQuery.columnNames
					&& $.isArray(self.lastQuery.columnNames)
					&& self.lastQuery.rowData
					&& $.isArray(self.lastQuery.rowData)
					&& $.isNumeric(self.lastQuery.columnId)
			}

			if (self.settings.receiveResults && json.queries.length) {

				json.results.rows = self._convertResultsJson(json, from);
				json.results.from = from;
				json.results.to = Math.min(json.results.from - 1 + self.settings.batchSize, json.results.total);
				$.extend(data, { results: json.results });
			}

			if (self.settings.receiveJson) {
				data = json;
				data.queryText = self.lastQuery.displayQuery;
				data.keywords = self.lastQuery.keywords;
				data.query = self.lastQuery.query;
				data.auto = self.lastQuery.auto;
			}

			self.settings.queryResponseReceived(data);
		}, 0);
	},

	getSql: function (callback) {
		var self = this;
		if (!self.settings.token)
			return;
		var q1 = $("<div />").html(self.lastQuery.query).text();
		self._xmlRpc(function (json) {
			if (json && json.status == "ok") {
				setTimeout(function () {
					callback && callback(json.queries[0].q);
				}, 0);
			}

		}, 'server.getSql', [self.settings.token, self.settings.databaseId, q1]);
	},

	abort: function (silentAbort) {
		if (this.xhrSubmit) {

			if (this.xhrSubmit.readystate != 4) {
				this.xhrSubmit.abort();

				if (this.settings.token && (this.settings.token !== 'anonymous')) {
					var self = this;
					var silent = this.xhrSubmit.silent;
					var success = function (json) {
						if (!silent) {
							self.settings.queryStopped();
							if (!silentAbort) {
								self.settings.aborted(json);
							}
						}
					};

					this._xmlRpc(success, 'server.abort', [this.settings.token, this.settings.databaseId]);
				}
			}

			this.xhrSubmit = null;
		}
	},
	
	_convertResultsJson: function (json, from) {
		var self = this;
		var rows = [];

		$.each(json.queries[0].columns, function (columnKey, columnValue) {
			var alias = columnKey + "_" + columnValue.n.replace(new RegExp(" ", 'g'), "");
			columnValue.alias = self._getUniqueAlias(json.queries[0].columns, alias);
			columnValue.id = columnKey;
		});
		var columns = $.map(json.queries[0].columns, function (column) {
			return column.alias;
		});

		var rowNumber = json.results.from;
		$.each(json.results.rows, function (rowKey, rowValue) {
			if (rowNumber >= from) {
				if (rowNumber >= (from + self.settings.pageSize)) {
					return false;
				}

				var row = {};
				$.each(columns, function (index, value) {
					row[value] = rowValue.length > index ? rowValue[index] : "";
				});

				rows.push(row);
			}
			rowNumber++;
		});

		return rows;
	},

	_getUniqueAlias: function (columns, alias) {
		var self = this;
		var existing = $.grep(columns, function (column, i) {
			return column.alias && column.alias == alias;
		});

		if (!existing.length)
			return alias;

		return self._getUniqueAlias(columns, "_" + alias);
	},

	_xmlRpc: function (process, method, params, secondTry, sync) {
		var self = this;
		var xmlDoc = $.xmlrpc.document(method, params, 'xmlnsex');
		var xmlData = null;
		if ("XMLSerializer" in window) {
			xmlData = new window.XMLSerializer().serializeToString(xmlDoc);
		} else {
			// IE does not have XMLSerializer
			xmlData = xmlDoc.xml;
		}

		xmlData = xmlData.replace('xmlnsex', 'xmlns:ex');

		var xhr = $.ajax({
			type: "POST",
			url: this.settings.requestUrl,
			data: xmlData,
			async: !sync,
			success: function (data) {
				try {
					var json = $.xmlrpc.parseDocument(data);

					if (json.status == 'ok' || json.status == 'not supported') {
						process(json);
					}
					else if (json.status == 'error') {
						if (json.error.id == 15) { //aborted
							return;
						}

						if (json.error.id == 8) {
							json.error.message = 'Database ' + self.settings.databaseId + ' does not support anonymous access, please login';
						}

						if (json.error.id == 31) {
							json.error.message = 'Database ' + self.settings.databaseId + ' does not exist on server';
						}
						self.settings.errorReceived(json.error);
					}
				} catch (e) {
					alert(e);
				}
			},
			error: function (xhrequest, status) {
				self.settings.errorReceived();

				if (xhrequest.status == 404) {
					process({ id: self.clientQueryId, status: self.SERVICE_UNAVAILABLE });

				} else if (!secondTry && (status != 'abort')) {
					setTimeout(function () { self._xmlRpc(process, method, params, true); }, 1000);

				} else if (secondTry && (status != 'abort') && self.lastErrorId != -1) {
					self.lastErrorId = -1;
					self.settings.errorReceived({
						id: -1,
						message: 'Server is offline or unavailable'
					});
				}
			},
			dataType: "xml"
		});

		return xhr;
	},

	_fullJsonPost: function (action, value) {
		var userAgent = (navigator.userAgent || navigator.vendor || window.opera).toLowerCase();
		var isIos; //has full support of features in iOS 4.0+, uses a new window to accomplish this.
		var isAndroid; //has full support of GET features in 4.0+ by using a new window. Non-GET is completely unsupported by the browser. See above for specifying a message.
		var isOtherMobileBrowser; //there is no way to reliably guess here so all other mobile devices will GET and POST to the current window.
		if (/ip(ad|hone|od)/.test(userAgent)) {
			isIos = true;
		} else {
			isOtherMobileBrowser = /avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|playbook|silk|iemobile|iris|kindle|lge |maemo|midp|mmp|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(userAgent) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|e\-|e\/|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(di|rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|xda(\-|2|g)|yas\-|your|zeto|zte\-/i.test(userAgent.substr(0, 4));
		}

		var getiframeDocument = function (iframe) {
			var iframeDoc = iframe[0].contentWindow || iframe[0].contentDocument;
			if (iframeDoc.document) {
				iframeDoc = iframeDoc.document;
			}
			return iframeDoc;
		}

		var $form = $('<form/>', {
			action: action,
			method: 'POST',
			enctype: "text/plain"
		});

		$form.append($('<input/>', {
			type: 'hidden',
			name: '{ "fake": "',
			value: 'fake",' + value.slice(1)
		}));

		if (isOtherMobileBrowser) {
			$form.appendTo("body").hide();
		} else {
			var formDoc = null;
			if (isIos) {
				var downloadWindow = window.open("about:blank");
				downloadWindow.document.title = "downloading...";
				formDoc = downloadWindow.document;
				window.focus();
			} else {
				var $iframe = $("<iframe style='display: none' src='about:blank'></iframe>").appendTo("body");
				formDoc = getiframeDocument($iframe);
			}
			formDoc.write("<html><head></head><body></body></html>");
			$form.appendTo($(formDoc).find('body'));
		}

		$form.submit();
	}
};

if (!String.prototype.endsWith) {
	String.prototype.endsWith = function (pattern) {
		var d = this.length - pattern.length;
		return d >= 0 && this.lastIndexOf(pattern) === d;
	};
}

if (!window.crypto) {
	window.crypto = window.msCrypto;
}

/* =============================================================
 * kueri.searchBox.js 
 * ============================================================ */

(function ($) {
	var ENTER_KEY = 13,
        LEFT_KEY = 37,
        UP_KEY = 38,
        RIGHT_KEY = 39,
        DOWN_KEY = 40,
        TAB_KEY = 9,
		ESC_KEY = 27,
		SPACE_KEY = 32,
		A_KEY = 65,
        namespace = "kueri.searchbox",
        replacements = ['"<str>"', '#', '<MM/DD/YYYY>', '<Month', 'name>', '<Year>', '<Time', 'HH:MM:SS>', '<Day>', '-#-#-#-', '-<str>-<str>-<str>-', '-<MM/DD/YYYY>-<MM/DD/YYYY>-<MM/DD/YYYY>-', '<location>'],
        reservedWords = ['show', 'of', 'with', 'in', 'and', 'the', 'for', 'how many', 'starting', 'ending', 'between', 'to'],
        nsEvent = function () { return $.map(arguments, function (e) { return e + "." + namespace; }).join(' '); };

	var defaults = {
		placeholder: 'Enter your query in simple english...',
		rephraseText: 'Continue typing or rephrase',
		ignoredOptionText: 'Suggestions without:',
		defaultQuery: null,
		receiveResults: true,
		receiveJson: false,
		batchSize: 200,
		pageSize: 20,
		interval: 250,
		requestUrl: "http://dev.simpleql.com/a/xmlrpc",
		downloadCsvUrl: "http://dev.simpleql.com/a/download",
		token: 'anonymous',
		databaseId: 199,
		showDatabases: false,
		multipleDatabases: false,
		debug: false,
		maxDelay: 1000,
		preventDoublePasteDelay: 1000,
		runAsYouType: false,
		itemsCapacity: 4,
		alwaysShowSuggestions: false,
		boxClass: 'search-box',
		clearButtonClass: 'clear-search',
		searchButtonClass: 'make-search',
		itemSelectedClass: 'selected',
		loaderClass: 'search-box-loader',
		loaderBgClass: 'search-box-loader-bg',
		delayViewClass: 'delay-view',
		delayedIndicatorClass: 'delayed',
		delayedQueryIndicatorClass: 'delayed-query',
		searchInputTemplate: '<input type="text" class="search-text">',
		clearButtonTemplate: '<a href="#Clear"></a>',
		searchButtonTemplate: '<a href="#Search"></a>',
		listTemplate: '<ul class="select-dropdown"></ul>',
		queryItemClass: 'query-suggest',
		runItemClass: 'run-suggest',
		copyItemClass: 'copy-suggest',
		emptyItemClass: 'no-results',
		itemTemplate: '<li><a href="#"></a></li>',
		cursorTemplate: '<div class="blink-cursor">|</div>'
	};

	var SearchBox = function (el, options) {
		this.settings = $.extend({}, defaults, options);
		this.$element = $(el);
		this.timeout = null;
		this.clientQueryId = 0;
		this.lastQuery = null;
		this.lastBatch = null;
		this.lastRun = null;
		this.runsAttempted = 0;
		this.canGetResults = false;
		this.showDatabases = this.settings.showDatabases;
		this.xhr = null;
		this.xhrSubmit = null;
		this.ignores = [];
		this.oldIgnores = [];
		this.suggests = [];
		this.oldSuggests = [];
		this.proxy = null;
		this.init();
	};

	SearchBox.prototype = {
		constructor: SearchBox,

		init: function () {
			var self = this;

			this.proxy = new Kueri.SearchConnect({
				receiveResults: this.settings.receiveResults,
				receiveJson: this.settings.receiveJson,
				batchSize: this.settings.batchSize,
				pageSize: this.settings.pageSize,
				requestUrl: this.settings.requestUrl,
				downloadCsvUrl: this.settings.downloadCsvUrl,
				token: this.settings.token,
				databaseId: this.settings.databaseId,
				multipleDatabases: this.settings.showDatabases || this.settings.multipleDatabases,
				debug: this.settings.debug,
				beforeRunQuery: function (submittingArgs) { self.$element.trigger("searchbox:beforeRunQuery", submittingArgs); },
				queryStarted: function () { self._showLoader(); },
				queryStopped: function () { self._hideLoader(); },
				queryResponseReceived: function(data) {
					if (self.delayedTimeout) {
						clearTimeout(self.delayedTimeout);
						self.delayedTimeout = null;
					}
					self.hideDelayedIndicator(true);

					self.$element.trigger("searchbox:results", [data]);
				},
				aborted: function (json) { self.$element.trigger("searchbox:abort", json); },
				errorReceived: function(error) {
					if (error) {
						if (error.id == 21) {
							self._hideLoader();
						}

						self.$element.trigger("searchbox:error", error);

					} else {
						self._hideLoader();
						setTimeout(function () { self.hideDelayedIndicator(); }, self.settings.maxDelay + 50);
					}
				}
			});

			this.$element.addClass(this.settings.boxClass).prop('spellcheck', false);

			var nav = window.navigator;
			this.msie = (nav.userAgent.indexOf('MSIE') !== -1 || nav.appVersion.indexOf('Trident/') > 0);
			if (this.msie) {
				this.$element.addClass("ie");
			}

			this.iphone = (navigator.userAgent.match(/iPhone/i) || navigator.userAgent.match(/iPod/i));
			if (this.iphone) {
				this.$element.addClass("iphone");
			}
			
			this.$databaseList = this.showDatabases ? $('<div></div>').appendTo(this.$element).addClass("db-container") : null;
			if (this.$databaseList) {
				this._fillDatabases(this.settings.databaseId);
			}

			this.$searcher = $('<div></div>').appendTo(this.$element).addClass("search-container");
			this.$placeholder = $('<div></div>').appendTo(this.$searcher).addClass("placeholder").text(this.settings.placeholder);
			this.$searchInput = $(this.settings.searchInputTemplate).appendTo(this.$searcher);
			if (this.iphone) {
				this.$highlightedSearch2 = $('<div class="highlighted-search"></div>').appendTo(this.$searcher);
			}
			this.$highlightedSearch = $('<div class="highlighted-search"><div><div class="highlighted-search-renderer"></div></div></div>').appendTo(this.$searcher);
			this.$clearButton = $(this.settings.clearButtonTemplate).appendTo(this.$searcher).addClass(this.settings.clearButtonClass);
			this.$searchButton = $(this.settings.searchButtonTemplate).appendTo(this.$searcher).addClass(this.settings.searchButtonClass);
			this.$delayIndicator = $("<b></b>").appendTo(this.$searcher).hide();
			this.$optionsList = $(this.settings.listTemplate).appendTo(this.$searcher).hide();
			this._refreshPlaceholder();
			setInterval(function() {
				if (self._hasSelection()) {
					self._highlightIgnored();
				}
			}, self.settings.interval);

			this.$searchInput
				.on(nsEvent('keydown'), function(e) {

					setTimeout(function() {
						self._highlightIgnored();
					}, 100);

					if ((e.which || e.keyCode) == A_KEY && e.ctrlKey) {
						var textLength = self.$searchInput.val().length;
						var el = self.$searchInput[0];
						if (textLength) {
							if (el.selectionStart != 0 || el.selectionEnd != 0) {
								self.$searchInput.scrollLeft(0);
							} else {
								var rect = el.getBoundingClientRect();
								self.$searchInput.scrollLeft(rect.width);
							}
						}
					}
					self._stopExecution();

					switch (e.which || e.keyCode) {
					case ENTER_KEY:
						e.preventDefault();

						var $selectedOption = self.$optionsList.children("." + self.settings.itemSelectedClass);
						if ($selectedOption.length) {
							self._chooseOption($selectedOption);
						} else if (self.canGetResults) {
							self.getResults();
						} else {
							self.doSearch(true, null, true);;
							self._increaseAttempts();
						}
						break;
					case LEFT_KEY:
						self.doSearch();
						break;
					case RIGHT_KEY:
						if (!self.copyHovered(e)) {
							self.doSearch();
						}
						break;
					case SPACE_KEY:
						self.copyHovered(e, true);
						break;
					case UP_KEY:
						e.preventDefault();
						self._selectNextOption(false);
						break;
					case DOWN_KEY:
						e.preventDefault();
						self._selectNextOption(true);
						break;
					case TAB_KEY:
						var $options = self.$optionsList.children();
						if ($options.length == 1 && $options.hasClass(self.settings.copyItemClass)) {
							e.preventDefault();
							self._copyOption($options);
						}
						break;
					}

				})
				.on(nsEvent('textchange'), function () {
					self._stopExecution();
					self.runsAttempted = 0;
					self.canGetResults = false;
					self._refreshSearchButton();
					self._highlightIgnored();
					self.doSearch();
				})
				.on(nsEvent('mousedown'), function() {
					if (self.$optionsList.find("li").length) {
						self.$optionsList.show();
					}

					if (!self._getQueryText().length) {
						self.doSearch();
					}
				})
				.on(nsEvent('click', 'touchstart'), function() {
					self._highlightIgnored();
					this.focus();
					self.doSearch();

					var query = self._getQueryText();
					if (!self.canGetResults && (!query || !query.length)) {
						self._increaseAttempts();
					}
				})
				.on(nsEvent('mousemove'), function () {
					self._highlightIgnored();
				})
				.bind("input paste", function (e) {
					self._refreshPlaceholder();
				});

			//prevent paste twice
			var lastPastedValue = null;
			var lastPasteTimeout = null;
			this.$searchInput
				.bind("paste", function (e) {
					
					if (lastPastedValue === (e.originalEvent || e).clipboardData.getData('text/plain')) {
						e.preventDefault();
						if (lastPasteTimeout) { clearTimeout(lastPasteTimeout); }
					} else {
						lastPastedValue = (e.originalEvent || e).clipboardData.getData('text/plain');
					}

					lastPasteTimeout = setTimeout(function () { lastPastedValue = null; }, self.settings.preventDoublePasteDelay);
				});

			this.$searchButton
                .on(nsEvent("click"), function (e) {
                	e.preventDefault();
					self._stopExecution();

                	if (self.canGetResults) {
                		self.getResults();
                	} else {
                		self.doSearch(true, null, true);
                		self._increaseAttempts();
                	}

                	self.$searchInput.focus();
                	return false;
                });

			this.$clearButton
                .on(nsEvent("click"), function (e) {
                	e.preventDefault();
                	self._stopExecution();
                	self.clear();
                	self.$searchInput.focus();
                	return false;
                });

			this.$optionsList
                .on(nsEvent("click"), ".receive-suggestions", function (e) {
                	e.preventDefault();
                	self.doSearch();
                	return false;
                })
                .on(nsEvent("click"), "li", function (e) {
                	var $this = $(this);
                	e.preventDefault();
                	self.runsAttempted = 0;
                	self._chooseOption($this);
                	self.$searchInput.focus();
                	return false;
                });

			if (!this.settings.alwaysShowSuggestions) {
				$(document).click(function(e) {
					if (!self.$element.find($(e.target)).length) {
						self.$optionsList.hide();
						self.runsAttempted = 0;
					}
				});

				$(document).on('keydown', function (e) {
					var key = e.which || e.keyCode;
					if (key == ESC_KEY) {
						self.$optionsList.hide();
						self.runsAttempted = 0;
					}
				});
			}

			if (this.settings.defaultQuery) {
				this._setQueryText(this.settings.defaultQuery);
				this._applyCurrentQuery();
			}
		},

		setFocus: function () {
			this.$searchInput.focus();
			this._highlightIgnored();
			this.doSearch();
		},

		getDatabases: function (process) {
			this.proxy.getDatabases(process);
		},

		changeDatabase: function (databaseId) {
			this._changeDatabase(databaseId);
			this.clear();
			this.$element.trigger("searchbox:databaseChanged", this.settings.databaseId);
		},

		setToken: function (token) {
			this.proxy.setToken(token);
		},

		verifyToken: function () {
			this.proxy.getDatabases(function() {}, true);
		},

		enableRunAsYouType: function (enabled) {
			this.settings.runAsYouType = enabled;
		},

		setQuery: function (query, doNotRun, databaseId) {
			if (databaseId) {
				this._changeDatabase(databaseId);
			}
			this.$element.trigger("searchbox:databaseChanged", this.settings.databaseId);

			this._setQueryText(query);
			this._refreshPlaceholder();

			if (!doNotRun) {
				this._applyCurrentQuery();
			} else {
				this._highlightIgnored();
			}
		},

		doSearch: function (immediate, callback, isEnter, customQuery) {
			var self = this;
			this._refreshPlaceholder();
			this._clearTimeouts();

			this.timeout = setTimeout(function () {

				self.delayedTimeout = setTimeout(function () { self.showDelayedIndicator(); }, self.settings.maxDelay);

				if (self.settings.maxDelay > 0) {
					self.proxy.getSuggestions(self, customQuery ? customQuery : self._getQuery(),
                        function (data) {
                        	if (self.delayedTimeout) {
                        		clearTimeout(self.delayedTimeout);
                        		self.delayedTimeout = null;
                        	}

                        	self._refresh(data, callback, isEnter && (data.ignore.length || data.ambiguity || customQuery));

                        	callback && callback();

                        	self.$element.trigger("searchbox:suggestions", data);
                        },
						isEnter);
				}

			}, immediate ? 0 : this.settings.interval);
		},

		getResults: function (hidden, withoutKeywords) {
			var self = this;
			if (self.canGetResults) {
				self.runsAttempted = 0;

				var $queryOption = self.$optionsList.find("li." + self.settings.queryItemClass);
				if ($queryOption.length && (!hidden || (self.lastRun != $queryOption.data('query')))) {

					if (!self.settings.alwaysShowSuggestions && !hidden) { self.$optionsList.hide(); }

					self.proxy.submitSuggestion(self,
						$queryOption.data('query'),
						withoutKeywords ? null : self._getQueryText(),
						null, null, null, null, hidden);

					self.lastRun = $queryOption.data('query');
					return true;
				}
			}

			return false;
		},

		getPage: function (page, sorting) {
			this.proxy.getPage(page, sorting);
		},

		runDrillDown: function (column, row, sorting) {
			this.proxy.runDrillDown(column, row, sorting);
		},

		runDrillUp: function (column, row, sorting) {
			return this.proxy.runDrillUp(column, row, sorting);
		},

		sort: function (sorting) {
			this.proxy.sort(sorting);
		},

		downloadCsv: function () {
			this.proxy.downloadCsv();
		},

		clear: function () {
			this._setQueryText("");
			this.lastRun = null;
			this.$highlightedSearch.find('.highlighted-search-renderer').html('');
			this.doSearch();
			this.runsAttempted = 0;
			this.$element.trigger("searchbox:clear");
		},

		destroy: function () {
			var ns = '.' + namespace;
			this.$element.off(ns);
			this.$searchInput.off(ns);
			this.$searchButton.off(ns);
			this.$clearButton.off(ns);
			this.$optionsList.off(ns);
			this.$delayIndicator.off(ns);
		},

		copyHovered: function (e, ignoreMouseHover) {
			var self = this;
			var $hovered = self.$optionsList.children('.selected');
			if (!$hovered.length && !ignoreMouseHover) {
				var hoveredElements = document.querySelectorAll(':hover');
				$hovered = self.$optionsList.children().filter(function (index) {

					for (var i = 0; i < hoveredElements.length; i++) {
						if (hoveredElements[i] == this)
							return true;
					}
					return false;
				});
			}

			if ($hovered.length && $hovered.hasClass(self.settings.copyItemClass)) {
				e.preventDefault();
				self._copyOption($hovered);
				return true;
			}

			return false;
		},
		
		_fillDatabases: function (dbId) {
			var self = this;
			if (this.showDatabases) {

				self.$dbDropdown = $('<select></select>').appendTo(self.$databaseList).addClass("search-container");
				self.$dbDropdown.on('changed.bs.select', function (e) {
					var databaseId = parseInt($(this).find(':selected').attr('data-id'));
					self.proxy.changeDatabase(databaseId);
					self.settings.databaseId = parseInt(databaseId);
					self.clear();
					self.$element.trigger("searchbox:databaseChanged", self.settings.databaseId);
				});

				self.$dbDropdown.selectpicker({
					style: 'btn-inverse',
					size: 8,
					dropdownAlignRight: true,
					noneSelectedText: ''
				});

				self.proxy.getDatabases(function (list) {
					if (!list || !list.length) {
						self.$databaseList.remove();
					} else {

						if (!self.settings.databaseId) {
							self.settings.databaseId = list[0].id;
							self.doSearch(true);
						}
						
						$.each(list, function (i, v) {
							if (self.settings.debug || !v.develop) {
								var $option = $('<option></option>').appendTo(self.$dbDropdown)
									.attr("data-id", v.id).attr("value", v.id)
									.attr("title", "<i class='fa fa-bars'></i><span class='db-title'>" + v.name + "</span>").text(v.name);

								if (v.id == dbId) {
									$option.prop('selected', true);
								}
							}
						});

						self.$dbDropdown.selectpicker('refresh');
					}
				});
			}
		},

		_changeDatabase: function (databaseId) {
			this.proxy.changeDatabase(databaseId);
			this.settings.databaseId = parseInt(databaseId);

			if (this.showDatabases) {
				this.$dbDropdown.selectpicker('val', databaseId);
			}
		},

		_applyCurrentQuery: function () {
			var self = this;
			this.doSearch(false, function () {
				var $queryOption = self.$optionsList.find("li." + self.settings.queryItemClass);
				if ($queryOption.length) {

					if (!self.settings.alwaysShowSuggestions) { self.$optionsList.hide(); }

					self.proxy.submitSuggestion(self, $queryOption.data('query'), self._getQueryText());
					self.$searchInput.focus();
				}
			});
		},

		_applySuggestionByEnter: function () {
			var self = this;
			var notSelector = ":not(." + self.settings.emptyItemClass + ")";
			var $firstSuggestion = self.$optionsList.children(notSelector + ":first");
			if ($firstSuggestion.length) {
				self.doSearch(true, null, true, {
					query1: $firstSuggestion.data('query'),
					query2: ""
				});
			}
		},

		_refreshPlaceholder: function () {
			var query = this._getQueryText();
			(query && query.length) ? this.$placeholder.hide() : this.$placeholder.show();
		},

		_refresh: function (data, preventRunAsYouType, isEnter) {
			var self = this;
			var queryText = (data.query.query1 || "") + (data.query.query2 || "");
			this.hideDelayedIndicator();
			this.oldIgnores = this.ignores;
			this.ignores = data.ignore || [];
			this.ignores.sort(function (a, b) { return (b || "").length - (a || "").length; });

			this.oldSuggests = this.suggests;
			this.suggests = data.suggests || [];

			this._highlightIgnored();
			self.canGetResults = this._fillSuggests(this.suggests, queryText, data.showIgnoredOption);
			
			if (this.runAsYouTypeTimeout) {
				clearTimeout(this.runAsYouTypeTimeout);
				this.runAsYouTypeTimeout = null;
			}

			var runQuery = function(overlay, withoutKeywords) {
				if (self.getResults(!overlay, withoutKeywords)) {
					if (!overlay) {
						self.delayedTimeout = setTimeout(function() { self.showDelayedIndicator(true); }, 0);
					}
				}
			};

			if (isEnter) {
				if (data.outOfScope && self.oldSuggests.length) {
					self.canGetResults = self._fillSuggests(self.oldSuggests, queryText, data.showIgnoredOption);
				}

				if (self.canGetResults) {
					runQuery(true, true);
					self._emptyOptionList();
					self.canGetResults = false;
				} else if (queryText === self._getQueryText()) {
					self._applySuggestionByEnter();
				}
			} else if (this.settings.runAsYouType && !preventRunAsYouType) {
				self.runAsYouTypeTimeout = setTimeout(runQuery, 1000);
			}

			this._refreshSearchButton();
		},

		_refreshSearchButton: function () {

			if (this.$searchButton.hasClass('disabled') && this.canGetResults) {
				this.$searchButton.removeClass('disabled');
			}
		},

		_fillSuggests: function (suggests, queryText, showIgnoredOption) {
			var hasQueryOrRun = false;
			var hasQuery = false;
			var self = this;
			this._emptyOptionList();
			if (suggests && suggests.length) {

				this.$optionsList.css("max-height", "inherit");

				$.each(suggests, function (i, v) {

					if ((v.type == self.proxy.SUGGEST_UNSUPPORTED) || (v.type == self.proxy.SUGGEST_AMBIGUITY) || (v.type == self.proxy.SERVICE_UNAVAILABLE)) {

						self._addEmptyOption(v.text);
						if ((v.type == self.proxy.SUGGEST_UNSUPPORTED) || (v.type == self.proxy.SERVICE_UNAVAILABLE)) {
							return false;
						}
					} else {
						$.each(replacements, function(iR, vR) {
							v.text = v.text.replace(vR, $('<div />').text(vR).html());
						});

						var styledText = self._makeTextBold(queryText, $('<div />').html(v.text).text());
						hasQueryOrRun = hasQueryOrRun || (v.type == self.proxy.SUGGEST_QUERY) || (v.type == self.proxy.SUGGEST_TO_RUN);
						hasQuery = hasQuery || (v.type == self.proxy.SUGGEST_QUERY);

						var itemClass = self._getItemClass(v.type);
						self._addOption(styledText, itemClass, v.query);


						if ((i + 1 - (hasQuery ? 1 : 0)) >= self.settings.itemsCapacity) {
							self.$optionsList.css("max-height", self.$optionsList.outerHeight() + "px");
						}
					}
				});

				if (showIgnoredOption) {
					this._showIgnoredOption();
				}
				this._warnRephrase();
				this.$optionsList.show();
			} else {
				this.$optionsList.hide();
			}

			return hasQueryOrRun;
		},

		_getItemClass: function (suggestType) {
			switch (suggestType) {
				case this.proxy.SUGGEST_QUERY:
					return this.settings.queryItemClass;
				case this.proxy.SUGGEST_TO_RUN:
					return this.settings.runItemClass;
				default:
					return this.settings.copyItemClass;
			}
		},

		_highlightIgnored: function () {
			var queryText = this._getQueryText();
			var parts = $.map(this._splitWords(queryText), function (val, wordIndex) {
				return {
					word: val,
					css: ''
				};
			});

			var self = this;
			if (this.ignores && this.ignores.length) {
				$.each(this.ignores, function (ind, v) {
					var ignoredparts = self._splitWords(v);
					var cssClass = (self.oldIgnores.indexOf(v) == -1) ? "ignored-word" : "ignored-word-old";

					for (var i = 0; i <= (parts.length - ignoredparts.length) ; i++) {

						var estimatedWord = $.map(parts.slice(i, i + ignoredparts.length), function(val, wordIndex) { return val.word; }).join(' ');
						if (estimatedWord.toLowerCase() === v.toLowerCase()) {

							for (var j = i; j < (i + ignoredparts.length) ; j++) {
								parts[j].css = cssClass;
							}
						}
					}
				});
			}

			this._insertCursor(parts, queryText);
			var $renderer = this.$highlightedSearch.find('.highlighted-search-renderer');
			
			var words = $.map(parts, function (val, wordIndex) {
				if (val.css.length) {
					return '<span class="' + val.css + '">' + val.word + '</span>';
				}

				return val.word;
			});

			var updatedText = this._combineWords(words);

			if ($renderer.html() != updatedText) {
				$renderer.html(updatedText);
			}

			var $cursor = this.$element.find('.blink-cursor');
			if ($cursor.length) {
				this._scrollCursorIntoView($cursor, this.$highlightedSearch.children('div'));
			}
		},

		_scrollCursorIntoView: function ($cursor, $container) {

			var dim = {
				e: this._getDimensions($cursor),
				s: this._getDimensions($container)
			};

			var rel = {
				left: dim.e.rect.left - (dim.s.rect.left + dim.s.border.left),
				right: dim.s.rect.right - dim.s.border.right - dim.s.scrollbar.right - dim.e.rect.right
			};

			var leftPosition = 0;
			if (rel.left < 0) {
				leftPosition = dim.s.scroll.left + rel.left;
				$container.scrollLeft(leftPosition);
			}
			else if (rel.left > 0 && rel.right < 0) {
				leftPosition = dim.s.scroll.left + Math.min(rel.left, -rel.right);
				$container.scrollLeft(leftPosition);
			}
		},

		_insertCursor: function (parts, queryText) {
			var self = this;
			var pos = this._getCursorPosition();
			var calcPos = 0;
			var $cursor = $('<div></div>').html(self.settings.cursorTemplate);
			if (this._hasSelection() || this.msie) {
				$cursor.children().addClass('blink-cursor-empty').text('');
			}

			$cursor.children().addClass('blink-cursor-ani');

			if (!queryText.length) {
				$cursor.children().addClass('blink-cursor-empty');
			}

			$.each(parts, function (ind, v) {
				var word = $('<span>' + v.word + '</span>').text();
				if ((calcPos + word.length) >= pos) {

					if ((pos - calcPos) >= word.length) {
						parts[ind].word += $cursor.html();
					} else {

						var wordPart = word.substring((pos - calcPos), word.length);
						var partPosition = v.word.lastIndexOf(wordPart);
						parts[ind].word = v.word.substring(0, partPosition) + $cursor.html() + v.word.substring(partPosition, v.word.length);
					}

					return false;
				}

				calcPos += (word.length + 1);
			});
		},

		_chooseOption: function ($option) {
			if ($option.hasClass(this.settings.queryItemClass) || $option.hasClass(this.settings.runItemClass)) {
				this._removeOptionSelection();
				if (!this.settings.alwaysShowSuggestions) { this.$optionsList.hide(); }
				this.proxy.submitSuggestion(this, $option.data('query'), this._getQueryText());
			}
			else if ($option.hasClass(this.settings.copyItemClass)) {
				this._copyOption($option);
			}
		},

		_copyOption: function ($option) {
			var $emptyOption = this.$optionsList.find('.' + this.settings.emptyItemClass);
			if ($emptyOption.length) {
				$emptyOption.remove();
			}

			this._setQueryText($option.data('query'));
			this.doSearch(true);
		},

		_emptyOptionList: function () {
			this.$optionsList.empty();
		},

		_getSelectedOptionIndex: function () {

			var prevSelected = this.$optionsList.children("." + this.settings.itemSelectedClass);
			if (prevSelected.length) {
				return this.$optionsList.children().index(prevSelected);
			}

			return -1;
		},

		_setSelectedOptionIndex: function (id) {

			var prevSelected = this.$optionsList.children("." + this.settings.itemSelectedClass);
			if (prevSelected.length) {
				prevSelected.removeClass(this.settings.itemSelectedClass);
			}

			if (this.$optionsList.children().length >= id + 1) {
				$(this.$optionsList.children()[id]).addClass(this.settings.itemSelectedClass);
			}
		},

		_selectNextOption: function (moveDown) {
			var $nextSelected = null;
			var $prevSelected = this._removeOptionSelection();
			var notSelector = ":not(." + this.settings.emptyItemClass + ")";
			if (moveDown) {
				if ($prevSelected.length && $prevSelected.next().length) {
					$nextSelected = $prevSelected.next(notSelector);
				} else {
					$nextSelected = this.$optionsList.children(notSelector + ":first");
				}
			}
			else {
				if ($prevSelected.length && $prevSelected.prev().length) {
					$nextSelected = $prevSelected.prev(notSelector);
				} else {
					$nextSelected = this.$optionsList.children(notSelector + ":last");
				}
			}

			if (!$nextSelected || !$nextSelected.length) {
				$nextSelected = $prevSelected;
			}
			
			if ($nextSelected && $nextSelected.length) {

				$nextSelected.addClass(this.settings.itemSelectedClass);
				if ($nextSelected[0].scrollIntoViewIfNeeded) {
					$nextSelected[0].scrollIntoViewIfNeeded();
				} else {
					this.$optionsList.scrollTop($nextSelected[0].offsetTop);
				}
			}
		},

		_removeOptionSelection: function () {
			var $prevSelected = this.$optionsList.children("." + this.settings.itemSelectedClass);
			if ($prevSelected.length) {
				$prevSelected.removeClass(this.settings.itemSelectedClass);
			}

			return $prevSelected;
		},
		
		showDelayedIndicator: function (query) {
			this.$delayIndicator.removeAttr("class");
			this.$delayIndicator.addClass(query ? this.settings.delayedQueryIndicatorClass : this.settings.delayedIndicatorClass);
			if (!this.$searcher.hasClass(this.settings.delayViewClass)) {
				this.$searcher.addClass(this.settings.delayViewClass);
			}
			this.$delayIndicator.show();
		},

		hideDelayedIndicator: function (query) {
			if (query && this.$delayIndicator.hasClass(this.settings.delayedQueryIndicatorClass)) {
				this.$delayIndicator.hide();
				this.$searcher.removeClass(this.settings.delayViewClass);
			}

			if (!query && this.$delayIndicator.hasClass(this.settings.delayedIndicatorClass)) {
				this.$delayIndicator.hide();
				this.$searcher.removeClass(this.settings.delayViewClass);
			}
		},

		_addOption: function (text, cssClass, query, prepend, id) {
			var $option = $(this.settings.itemTemplate)
				.data('query', query).addClass(cssClass);

			if (id) {
				$option.attr('id', id);
			}

			prepend ? $option.prependTo(this.$optionsList) : $option.appendTo(this.$optionsList);

			return $option.children("a").html(text);
		}, 
		
		_addEmptyOption: function (text, prepend, id) {
			this._addOption(text, this.settings.emptyItemClass, null, prepend, id);
		},

		_makeTextBold: function (query, text) {
			var s1Parts = this._splitWords(query);
			var s2Parts = $.map(this._splitWords(text), function (val, wordIndex) {

				return {
					word: val,
					updatedWord: val,
					used: false
				};
			});
			var textIndex = 0;
			var s1Word;
		    var i;
			for (i = 0; i < s1Parts.length; i++) {
				s1Word = s1Parts[i].replace(new RegExp('"', 'g'), '');
				if (!s1Word.length)
					continue;

				var found = false, loop = false;
				while (true) {

					if (textIndex < s2Parts.length) {
						for (var j = textIndex; j < s2Parts.length; j++) {
							var s2Word = s2Parts[j];

							var wordToCompare = s2Word.word;
							if (wordToCompare.startsWith('"')) {
								wordToCompare = wordToCompare.slice(1);
							}
							if (wordToCompare.endsWith('"')) {
								wordToCompare = wordToCompare.slice(0, -1);
							}

							if (!s2Word.used && wordToCompare.toLowerCase() == s1Word.toLowerCase()) {
								s2Word.used = true;
								found = true;
							}
						}
					}
					if (found) {
						break;
					}
					if (loop) {
						break;
					}
					loop = true;
					textIndex = 0;
				}
				if (found) {
					continue;
				}
			}

			for (i = 0; i < s1Parts.length; i++) {
			    s1Word = s1Parts[i].replace(new RegExp('"', 'g'), '');
			    if (!s1Word.length)
			        continue;

			    for (var x = 0; x < s2Parts.length; x++) {
			        var xWord = s2Parts[x];
			        if (!xWord.used) {
			            var matchedIndex = xWord.word.toLowerCase().indexOf(s1Word.toLowerCase());
			            var matched = matchedIndex == 0;
			            if (matched) {
			                xWord.used = true;
			                xWord.updatedWord = xWord.word.substr(0, s1Word.length) + '<b>' + xWord.word.substr(s1Word.length, xWord.word.length - s1Word.length) + '</b>';
			                break;
			            }
			        }
			    }
			}
			var s2Words = $.map(s2Parts, function (val, wordIndex) {
				if (reservedWords.indexOf(val.word.toLowerCase()) !== -1) {
					return val.word;
				}
				if (val.used) {
					return val.updatedWord;
				}
				if (val.updatedWord == ',') {
					return val.updatedWord;
				}

				if (replacements.indexOf(val.word) !== -1) {
					return '<span style="color: darkgray; font-style: italic;">' + $("<div />").text(val.word).html() + '</span>';
				}

				return '<b>' + val.updatedWord + '</b>';
			});

			return this._combineWords(s2Words);
		},

		_getQueryText: function () {
			return this.$searchInput.val();
		},

		_setQueryText: function (text) {
			this.$searchInput.val($("<div />").html(text).text());
		},

		_showLoader: function () {
			$("." + this.settings.loaderClass).show();
			$("." + this.settings.loaderBgClass).show();
		},

		_hideLoader: function () {
			$("." + this.settings.loaderClass).hide();
			$("." + this.settings.loaderBgClass).hide();
		},

		_getQuery: function () {

			var text = this._getQueryText();
			if (!text.length) {
				return {
					query1: "",
					query2: ""
				}
			}

			var position = this._getCursorPosition();
			if (position <= 0 || position >= text.length) {
				return {
					query1: text,
					query2: ""
				}
			}

			return {
				query1: text.substring(0, position),
				query2: text.substring(position, text.length)
			};
		},

		_getCursorPosition: function () {
			var pos = 0;
			var el = this.$searchInput[0];
			if (el.selectionStart || el.selectionEnd || el.selectionDirection) {

				if (el.selectionStart == el.selectionEnd) {
					pos = el.selectionStart;
				} else if (el.selectionStart != this.prevCursorStart) {
					pos = el.selectionStart;
				} else if (el.selectionEnd != this.prevCursorEnd) {
					pos = el.selectionEnd;
				} else {
					pos = this.prevCursorPos;
				}


				this.prevCursorPos = pos;
				this.prevCursorStart = el.selectionStart;
				this.prevCursorEnd = el.selectionEnd;

			}

			return pos;
		},

		_hasSelection: function () {
			var el = this.$searchInput[0];
			if (el.selectionStart || el.selectionEnd || el.selectionDirection) {
				return el.selectionStart != el.selectionEnd;
			}

			return false;
		},

		_splitWords: function (text) {
			var separator = String.fromCharCode(32);
			var parts = text.replace(new RegExp(String.fromCharCode(160), "g"), String.fromCharCode(32))
                                .replace(new RegExp(String.fromCharCode(32), "g"), String.fromCharCode(32) + String.fromCharCode(160))
                                 .split(separator);

			$.each(parts, function (ind, v) {
				parts[ind] = $.trim(parts[ind]);
			});

			return parts;
		},

		_combineWords: function (parts) {

			return parts.join('&nbsp;');
		},

		_getDimensions: function ($element) {
			return {
				border: this._getBorders($element[0]),
				scroll: {
					left: $element.scrollLeft()
				},
				scrollbar: {
					right: $element.innerWidth() - $element[0].clientWidth
				},
				rect: (function () {
					var r = $element[0].getBoundingClientRect();
					return {
						left: r.left,
						right: r.right
					};
				})()
			};
		},

		_getBorders: function (domElement, styles) {
			styles = styles || (document.defaultView && document.defaultView.getComputedStyle ? document.defaultView.getComputedStyle(domElement, null) : domElement.currentStyle);
			var px = document.defaultView && document.defaultView.getComputedStyle ? true : false;
			var b = {
				top: (parseFloat(px ? styles.borderTopWidth : $.css(domElement, "borderTopWidth")) || 0),
				left: (parseFloat(px ? styles.borderLeftWidth : $.css(domElement, "borderLeftWidth")) || 0),
				bottom: (parseFloat(px ? styles.borderBottomWidth : $.css(domElement, "borderBottomWidth")) || 0),
				right: (parseFloat(px ? styles.borderRightWidth : $.css(domElement, "borderRightWidth")) || 0)
			};
			return {
				top: b.top,
				left: b.left,
				bottom: b.bottom,
				right: b.right,
				vertical: b.top + b.bottom,
				horizontal: b.left + b.right
			};
		},

		getSql: function (callback) {
			self.proxy.getSql(callback);
		},

		abort: function (silentAbort) {
			this.proxy.abort(silentAbort);
		},
		
		_stopExecution: function () {
			this.abort(true);
			this._clearTimeouts();
			this.hideDelayedIndicator();
			this.hideDelayedIndicator(true);
		},

		_clearTimeouts: function () {
			if (this.timeout) {
				clearTimeout(this.timeout);
				this.timeout = null;
			}
			if (this.delayedTimeout) {
				clearTimeout(this.delayedTimeout);
				this.delayedTimeout = null;
			}
			if (this.runAsYouTypeTimeout) {
				clearTimeout(this.runAsYouTypeTimeout);
				this.runAsYouTypeTimeout = null;
			}
		},

		_increaseAttempts: function () {
			this.runsAttempted++;

			if (this._warnRephrase()) {
				if (!this.$optionsList.filter(':visible').length) {
					this.$optionsList.show();
				}
			}
		},

		_warnRephrase: function () {

			if (this.runsAttempted >= 3 && !this.$optionsList.find('#warnRephrase.' + this.settings.emptyItemClass).length) {
				this.$optionsList.find('.' + this.settings.emptyItemClass).remove();
				this._addEmptyOption(this.settings.rephraseText, true, 'warnRephrase');
				return true;
			}

			return false;
		},

		_showIgnoredOption: function () {

			var old = this.$optionsList.find('#ignoredWords.' + this.settings.emptyItemClass);
			if (old.length) {
				old.remove();
			}

			if (this.ignores && this.ignores.length) {
				var markup = this.settings.ignoredOptionText + '&nbsp;';

				var words = $.map(this.ignores, function(val, wordIndex) {
					return '<span class="ignored-strikeout">' + val + '</span>';
				});

				markup += words.join(',&nbsp;');

				this._addEmptyOption(markup, true, 'ignoredWords');
			}
		},
	};

	$.fn.searchBox = function (option) {
		var data = $(this).data(namespace);
		if (typeof option === 'string' && data && data[option]) {
			return typeof data[option] === "function" ? data[option].apply(data, Array.prototype.slice.call(arguments, 1)) : data[option];
		} else if (typeof option === 'object' || !option) {
			return this.each(function () {
				var $this = $(this),
                    options = typeof option == 'object' && option;
				data = $this.data(namespace);
				data || $this.data(namespace, (data = new SearchBox(this, options)));
				if (typeof option == 'string') {
					data[option]();
				}
			});
		} else {
			return $.error('There is no function with the name "' + option + '" in jQuery.' + namespace);
		}
	};

	$.fn.searchBox.defaults = defaults;
	$.fn.searchBox.Constructor = SearchBox;

})(jQuery);
!function(e){e(["jquery"],function(e){return function(){function t(e,t,n){return f({type:O.error,iconClass:g().iconClasses.error,message:e,optionsOverride:n,title:t})}function n(t,n){return t||(t=g()),v=e("#"+t.containerId),v.length?v:(n&&(v=c(t)),v)}function i(e,t,n){return f({type:O.info,iconClass:g().iconClasses.info,message:e,optionsOverride:n,title:t})}function o(e){w=e}function s(e,t,n){return f({type:O.success,iconClass:g().iconClasses.success,message:e,optionsOverride:n,title:t})}function a(e,t,n){return f({type:O.warning,iconClass:g().iconClasses.warning,message:e,optionsOverride:n,title:t})}function r(e){var t=g();v||n(t),l(e,t)||u(t)}function d(t){var i=g();return v||n(i),t&&0===e(":focus",t).length?void h(t):void(v.children().length&&v.remove())}function u(t){for(var n=v.children(),i=n.length-1;i>=0;i--)l(e(n[i]),t)}function l(t,n){return t&&0===e(":focus",t).length?(t[n.hideMethod]({duration:n.hideDuration,easing:n.hideEasing,complete:function(){h(t)}}),!0):!1}function c(t){return v=e("<div/>").attr("id",t.containerId).addClass(t.positionClass).attr("aria-live","polite").attr("role","alert"),v.appendTo(e(t.target)),v}function p(){return{tapToDismiss:!0,toastClass:"toast",containerId:"toast-container",debug:!1,showMethod:"fadeIn",showDuration:300,showEasing:"swing",onShown:void 0,hideMethod:"fadeOut",hideDuration:1e3,hideEasing:"swing",onHidden:void 0,extendedTimeOut:1e3,iconClasses:{error:"toast-error",info:"toast-info",success:"toast-success",warning:"toast-warning"},iconClass:"toast-info",positionClass:"toast-top-right",timeOut:5e3,titleClass:"toast-title",messageClass:"toast-message",target:"body",closeHtml:'<button type="button">&times;</button>',newestOnTop:!0,preventDuplicates:!1,progressBar:!1}}function m(e){w&&w(e)}function f(t){function i(t){return!e(":focus",l).length||t?(clearTimeout(O.intervalId),l[r.hideMethod]({duration:r.hideDuration,easing:r.hideEasing,complete:function(){h(l),r.onHidden&&"hidden"!==b.state&&r.onHidden(),b.state="hidden",b.endTime=new Date,m(b)}})):void 0}function o(){(r.timeOut>0||r.extendedTimeOut>0)&&(u=setTimeout(i,r.extendedTimeOut),O.maxHideTime=parseFloat(r.extendedTimeOut),O.hideEta=(new Date).getTime()+O.maxHideTime)}function s(){clearTimeout(u),O.hideEta=0,l.stop(!0,!0)[r.showMethod]({duration:r.showDuration,easing:r.showEasing})}function a(){var e=(O.hideEta-(new Date).getTime())/O.maxHideTime*100;f.width(e+"%")}var r=g(),d=t.iconClass||r.iconClass;if("undefined"!=typeof t.optionsOverride&&(r=e.extend(r,t.optionsOverride),d=t.optionsOverride.iconClass||d),r.preventDuplicates){if(t.message===C)return;C=t.message}T++,v=n(r,!0);var u=null,l=e("<div/>"),c=e("<div/>"),p=e("<div/>"),f=e("<div/>"),w=e(r.closeHtml),O={intervalId:null,hideEta:null,maxHideTime:null},b={toastId:T,state:"visible",startTime:new Date,options:r,map:t};return t.iconClass&&l.addClass(r.toastClass).addClass(d),t.title&&(c.append(t.title).addClass(r.titleClass),l.append(c)),t.message&&(p.append(t.message).addClass(r.messageClass),l.append(p)),r.closeButton&&(w.addClass("toast-close-button").attr("role","button"),l.prepend(w)),r.progressBar&&(f.addClass("toast-progress"),l.prepend(f)),l.hide(),r.newestOnTop?v.prepend(l):v.append(l),l[r.showMethod]({duration:r.showDuration,easing:r.showEasing,complete:r.onShown}),r.timeOut>0&&(u=setTimeout(i,r.timeOut),O.maxHideTime=parseFloat(r.timeOut),O.hideEta=(new Date).getTime()+O.maxHideTime,r.progressBar&&(O.intervalId=setInterval(a,10))),l.hover(s,o),!r.onclick&&r.tapToDismiss&&l.click(i),r.closeButton&&w&&w.click(function(e){e.stopPropagation?e.stopPropagation():void 0!==e.cancelBubble&&e.cancelBubble!==!0&&(e.cancelBubble=!0),i(!0)}),r.onclick&&l.click(function(){r.onclick(),i()}),m(b),r.debug&&console&&console.log(b),l}function g(){return e.extend({},p(),b.options)}function h(e){v||(v=n()),e.is(":visible")||(e.remove(),e=null,0===v.children().length&&(v.remove(),C=void 0))}var v,w,C,T=0,O={error:"error",info:"info",success:"success",warning:"warning"},b={clear:r,remove:d,error:t,getContainer:n,info:i,options:{},subscribe:o,success:s,version:"2.1.0",warning:a};return b}()})}("function"==typeof define&&define.amd?define:function(e,t){"undefined"!=typeof module&&module.exports?module.exports=t(require("jquery")):window.toastr=t(window.jQuery)});


(function () { function a(a) { this._value = a } function b(a, b, c, d) { var e, f, g = Math.pow(10, b); return f = (c(a * g) / g).toFixed(b), d && (e = new RegExp("0{1," + d + "}$"), f = f.replace(e, "")), f } function c(a, b, c) { var d; return d = b.indexOf("$") > -1 ? e(a, b, c) : b.indexOf("%") > -1 ? f(a, b, c) : b.indexOf(":") > -1 ? g(a, b) : i(a._value, b, c) } function d(a, b) { var c, d, e, f, g, i = b, j = ["KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"], k = !1; if (b.indexOf(":") > -1) a._value = h(b); else if (b === q) a._value = 0; else { for ("." !== o[p].delimiters.decimal && (b = b.replace(/\./g, "").replace(o[p].delimiters.decimal, ".")), c = new RegExp("[^a-zA-Z]" + o[p].abbreviations.thousand + "(?:\\)|(\\" + o[p].currency.symbol + ")?(?:\\))?)?$"), d = new RegExp("[^a-zA-Z]" + o[p].abbreviations.million + "(?:\\)|(\\" + o[p].currency.symbol + ")?(?:\\))?)?$"), e = new RegExp("[^a-zA-Z]" + o[p].abbreviations.billion + "(?:\\)|(\\" + o[p].currency.symbol + ")?(?:\\))?)?$"), f = new RegExp("[^a-zA-Z]" + o[p].abbreviations.trillion + "(?:\\)|(\\" + o[p].currency.symbol + ")?(?:\\))?)?$"), g = 0; g <= j.length && !(k = b.indexOf(j[g]) > -1 ? Math.pow(1024, g + 1) : !1) ; g++); a._value = (k ? k : 1) * (i.match(c) ? Math.pow(10, 3) : 1) * (i.match(d) ? Math.pow(10, 6) : 1) * (i.match(e) ? Math.pow(10, 9) : 1) * (i.match(f) ? Math.pow(10, 12) : 1) * (b.indexOf("%") > -1 ? .01 : 1) * ((b.split("-").length + Math.min(b.split("(").length - 1, b.split(")").length - 1)) % 2 ? 1 : -1) * Number(b.replace(/[^0-9\.]+/g, "")), a._value = k ? Math.ceil(a._value) : a._value } return a._value } function e(a, b, c) { var d, e, f = b.indexOf("$"), g = b.indexOf("("), h = b.indexOf("-"), j = ""; return b.indexOf(" $") > -1 ? (j = " ", b = b.replace(" $", "")) : b.indexOf("$ ") > -1 ? (j = " ", b = b.replace("$ ", "")) : b = b.replace("$", ""), e = i(a._value, b, c), 1 >= f ? e.indexOf("(") > -1 || e.indexOf("-") > -1 ? (e = e.split(""), d = 1, (g > f || h > f) && (d = 0), e.splice(d, 0, o[p].currency.symbol + j), e = e.join("")) : e = o[p].currency.symbol + j + e : e.indexOf(")") > -1 ? (e = e.split(""), e.splice(-1, 0, j + o[p].currency.symbol), e = e.join("")) : e = e + j + o[p].currency.symbol, e } function f(a, b, c) { var d, e = "", f = 100 * a._value; return b.indexOf(" %") > -1 ? (e = " ", b = b.replace(" %", "")) : b = b.replace("%", ""), d = i(f, b, c), d.indexOf(")") > -1 ? (d = d.split(""), d.splice(-1, 0, e + "%"), d = d.join("")) : d = d + e + "%", d } function g(a) { var b = Math.floor(a._value / 60 / 60), c = Math.floor((a._value - 60 * b * 60) / 60), d = Math.round(a._value - 60 * b * 60 - 60 * c); return b + ":" + (10 > c ? "0" + c : c) + ":" + (10 > d ? "0" + d : d) } function h(a) { var b = a.split(":"), c = 0; return 3 === b.length ? (c += 60 * Number(b[0]) * 60, c += 60 * Number(b[1]), c += Number(b[2])) : 2 === b.length && (c += 60 * Number(b[0]), c += Number(b[1])), Number(c) } function i(a, c, d) { var e, f, g, h, i, j, k = !1, l = !1, m = !1, n = "", r = !1, s = !1, t = !1, u = !1, v = !1, w = "", x = "", y = Math.abs(a), z = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"], A = "", B = !1; if (0 === a && null !== q) return q; if (c.indexOf("(") > -1 ? (k = !0, c = c.slice(1, -1)) : c.indexOf("+") > -1 && (l = !0, c = c.replace(/\+/g, "")), c.indexOf("a") > -1 && (r = c.indexOf("aK") >= 0, s = c.indexOf("aM") >= 0, t = c.indexOf("aB") >= 0, u = c.indexOf("aT") >= 0, v = r || s || t || u, c.indexOf(" a") > -1 ? (n = " ", c = c.replace(" a", "")) : c = c.replace("a", ""), y >= Math.pow(10, 12) && !v || u ? (n += o[p].abbreviations.trillion, a /= Math.pow(10, 12)) : y < Math.pow(10, 12) && y >= Math.pow(10, 9) && !v || t ? (n += o[p].abbreviations.billion, a /= Math.pow(10, 9)) : y < Math.pow(10, 9) && y >= Math.pow(10, 6) && !v || s ? (n += o[p].abbreviations.million, a /= Math.pow(10, 6)) : (y < Math.pow(10, 6) && y >= Math.pow(10, 3) && !v || r) && (n += o[p].abbreviations.thousand, a /= Math.pow(10, 3))), c.indexOf("b") > -1) for (c.indexOf(" b") > -1 ? (w = " ", c = c.replace(" b", "")) : c = c.replace("b", ""), g = 0; g <= z.length; g++) if (e = Math.pow(1024, g), f = Math.pow(1024, g + 1), a >= e && f > a) { w += z[g], e > 0 && (a /= e); break } return c.indexOf("o") > -1 && (c.indexOf(" o") > -1 ? (x = " ", c = c.replace(" o", "")) : c = c.replace("o", ""), x += o[p].ordinal(a)), c.indexOf("[.]") > -1 && (m = !0, c = c.replace("[.]", ".")), h = a.toString().split(".")[0], i = c.split(".")[1], j = c.indexOf(","), i ? (i.indexOf("[") > -1 ? (i = i.replace("]", ""), i = i.split("["), A = b(a, i[0].length + i[1].length, d, i[1].length)) : A = b(a, i.length, d), h = A.split(".")[0], A = A.split(".")[1].length ? o[p].delimiters.decimal + A.split(".")[1] : "", m && 0 === Number(A.slice(1)) && (A = "")) : h = b(a, null, d), h.indexOf("-") > -1 && (h = h.slice(1), B = !0), j > -1 && (h = h.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1" + o[p].delimiters.thousands)), 0 === c.indexOf(".") && (h = ""), (k && B ? "(" : "") + (!k && B ? "-" : "") + (!B && l ? "+" : "") + h + A + (x ? x : "") + (n ? n : "") + (w ? w : "") + (k && B ? ")" : "") } function j(a, b) { o[a] = b } function k(a) { var b = a.toString().split("."); return b.length < 2 ? 1 : Math.pow(10, b[1].length) } function l() { var a = Array.prototype.slice.call(arguments); return a.reduce(function (a, b) { var c = k(a), d = k(b); return c > d ? c : d }, -1 / 0) } var m, n = "1.5.3", o = {}, p = "en", q = null, r = "0,0", s = "undefined" != typeof module && module.exports; m = function (b) { return m.isNumeral(b) ? b = b.value() : 0 === b || "undefined" == typeof b ? b = 0 : Number(b) || (b = m.fn.unformat(b)), new a(Number(b)) }, m.version = n, m.isNumeral = function (b) { return b instanceof a }, m.language = function (a, b) { if (!a) return p; if (a && !b) { if (!o[a]) throw new Error("Unknown language : " + a); p = a } return (b || !o[a]) && j(a, b), m }, m.languageData = function (a) { if (!a) return o[p]; if (!o[a]) throw new Error("Unknown language : " + a); return o[a] }, m.language("en", { delimiters: { thousands: ",", decimal: "." }, abbreviations: { thousand: "k", million: "m", billion: "b", trillion: "t" }, ordinal: function (a) { var b = a % 10; return 1 === ~~(a % 100 / 10) ? "th" : 1 === b ? "st" : 2 === b ? "nd" : 3 === b ? "rd" : "th" }, currency: { symbol: "$" } }), m.zeroFormat = function (a) { q = "string" == typeof a ? a : null }, m.defaultFormat = function (a) { r = "string" == typeof a ? a : "0.0" }, "function" != typeof Array.prototype.reduce && (Array.prototype.reduce = function (a, b) { "use strict"; if (null === this || "undefined" == typeof this) throw new TypeError("Array.prototype.reduce called on null or undefined"); if ("function" != typeof a) throw new TypeError(a + " is not a function"); var c, d, e = this.length >>> 0, f = !1; for (1 < arguments.length && (d = b, f = !0), c = 0; e > c; ++c) this.hasOwnProperty(c) && (f ? d = a(d, this[c], c, this) : (d = this[c], f = !0)); if (!f) throw new TypeError("Reduce of empty array with no initial value"); return d }), m.fn = a.prototype = { clone: function () { return m(this) }, format: function (a, b) { return c(this, a ? a : r, void 0 !== b ? b : Math.round) }, unformat: function (a) { return "[object Number]" === Object.prototype.toString.call(a) ? a : d(this, a ? a : r) }, value: function () { return this._value }, valueOf: function () { return this._value }, set: function (a) { return this._value = Number(a), this }, add: function (a) { function b(a, b) { return a + c * b } var c = l.call(null, this._value, a); return this._value = [this._value, a].reduce(b, 0) / c, this }, subtract: function (a) { function b(a, b) { return a - c * b } var c = l.call(null, this._value, a); return this._value = [a].reduce(b, this._value * c) / c, this }, multiply: function (a) { function b(a, b) { var c = l(a, b); return a * c * b * c / (c * c) } return this._value = [this._value, a].reduce(b, 1), this }, divide: function (a) { function b(a, b) { var c = l(a, b); return a * c / (b * c) } return this._value = [this._value, a].reduce(b), this }, difference: function (a) { return Math.abs(m(this._value).subtract(a).value()) } }, s && (module.exports = m), "undefined" == typeof ender && (this.numeral = m), "function" == typeof define && define.amd && define([], function () { return m }) }).call(this);
if (window.ko) {
	(function(ko) {
		var numericObservable = function(initialValue) {
			var _actual = ko.observable(initialValue);

			var result = ko.dependentObservable({
				read: function() {
					return _actual();
				},
				write: function(newValue) {
					var parsedValue = parseFloat(newValue);
					_actual(isNaN(parsedValue) ? newValue : parsedValue);
				}
			});

			return result;
		};

		function Pager(totalItemCount, pageSize, currentPage) {
			var self = this;
			self.CurrentPage = numericObservable(currentPage || 1);
			self.TotalItemCount = ko.computed(totalItemCount);
			self.PageSize = numericObservable(pageSize || 20);
			self.PageSlide = numericObservable(2);

			self.LastPage = ko.computed(function() {
				return Math.floor((self.TotalItemCount() - 1) / self.PageSize()) + 1;
			});

			self.HasNextPage = ko.computed(function() {
				return self.CurrentPage() < self.LastPage();
			});

			self.HasPrevPage = ko.computed(function() {
				return self.CurrentPage() > 1;
			});

			self.FirstItemIndex = ko.computed(function() {
				return self.PageSize() * (self.CurrentPage() - 1) + 1;
			});

			self.LastItemIndex = ko.computed(function() {
				return Math.min(self.FirstItemIndex() + self.PageSize() - 1, self.TotalItemCount());
			});

			self.ThisPageCount = ko.computed(function() {
				var mod = self.LastItemIndex() % self.PageSize();
				if (mod > 0) return mod;
				return self.PageSize();
			});

			self.Pages = ko.computed(function() {
				var pageCount = self.LastPage();
				var pageFrom = Math.max(1, self.CurrentPage() - self.PageSlide());
				var pageTo = Math.min(pageCount, self.CurrentPage() + self.PageSlide());
				pageFrom = Math.max(1, Math.min(pageTo - 2 * self.PageSlide(), pageFrom));
				pageTo = Math.min(pageCount, Math.max(pageFrom + 2 * self.PageSlide(), pageTo));

				var result = [];
				for (var i = pageFrom; i <= pageTo; i++) {
					result.push(i);
				}
				return result;
			});
		}

		ko.pager = function(totalItemCount, pageSize, currentPage) {
			var pager = new Pager(totalItemCount, pageSize, currentPage);
			return ko.observable(pager);
		};
	}(ko));
}
new function(settings) { 
  // Various Settings
  var $separator = settings.separator || '&';
  var $spaces = settings.spaces === false ? false : true;
  var $suffix = settings.suffix === false ? '' : '[]';
  var $prefix = settings.prefix === false ? false : true;
  var $hash = $prefix ? settings.hash === true ? "#" : "?" : "";
  var $numbers = settings.numbers === false ? false : true;

  jQuery.query = function(useQueryString) {
    var is = function(o, t) {
      return o != undefined && o !== null && (!!t ? o.constructor == t : true);
    };
    var parse = function(path) {
      var m, rx = /\[([^[]*)\]/g, match = /^([^[]+)(\[.*\])?$/.exec(path), base = match[1], tokens = [];
      while (m = rx.exec(match[2])) tokens.push(m[1]);
      return [base, tokens];
    };
    var set = function(target, tokens, value) {
      var o, token = tokens.shift();
      if (typeof target != 'object') target = null;
      if (token === "") {
        if (!target) target = [];
        if (is(target, Array)) {
          target.push(tokens.length == 0 ? value : set(null, tokens.slice(0), value));
        } else if (is(target, Object)) {
          var i = 0;
          while (target[i++] != null);
          target[--i] = tokens.length == 0 ? value : set(target[i], tokens.slice(0), value);
        } else {
          target = [];
          target.push(tokens.length == 0 ? value : set(null, tokens.slice(0), value));
        }
      } else if (token && token.match(/^\s*[0-9]+\s*$/)) {
        var index = parseInt(token, 10);
        if (!target) target = [];
        target[index] = tokens.length == 0 ? value : set(target[index], tokens.slice(0), value);
      } else if (token) {
        var index = token.replace(/^\s*|\s*$/g, "");
        if (!target) target = {};
        if (is(target, Array)) {
          var temp = {};
          for (var i = 0; i < target.length; ++i) {
            temp[i] = target[i];
          }
          target = temp;
        }
        target[index] = tokens.length == 0 ? value : set(target[index], tokens.slice(0), value);
      } else {
        return value;
      }
      return target;
    };
    
    var queryObject = function(a) {
      var self = this;
      self.keys = {};
      
      if (a.queryObject) {
        jQuery.each(a.get(), function(key, val) {
          self.SET(key, val);
        });
      } else {
        self.parseNew.apply(self, arguments);
      }
      return self;
    };
    
    queryObject.prototype = {
      queryObject: true,
      parseNew: function(){
        var self = this;
        self.keys = {};
        jQuery.each(arguments, function() {
          var q = "" + this;
          q = q.replace(/^[?#]/,''); // remove any leading ? || #
          q = q.replace(/[;&]$/,''); // remove any trailing & || ;
          if ($spaces) q = q.replace(/[+]/g,' '); // replace +'s with spaces
          
          jQuery.each(q.split(/[&;]/), function(){
            var key = decodeURIComponent(this.split('=')[0] || "");
            var val = decodeURIComponent(this.split('=')[1] || "");
            
            if (!key) return;
            
            if ($numbers) {
              if (/^[+-]?[0-9]+\.[0-9]*$/.test(val)) // simple float regex
                val = parseFloat(val);
              else if (/^[+-]?[1-9][0-9]*$/.test(val)) // simple int regex
                val = parseInt(val, 10);
            }
            
            val = (!val && val !== 0) ? true : val;
            
            self.SET(key, val);
          });
        });
        return self;
      },
      has: function(key, type) {
        var value = this.get(key);
        return is(value, type);
      },
      GET: function(key) {
        if (!is(key)) return this.keys;
        var parsed = parse(key), base = parsed[0], tokens = parsed[1];
        var target = this.keys[base];
        while (target != null && tokens.length != 0) {
          target = target[tokens.shift()];
        }
        return typeof target == 'number' ? target : target || "";
      },
      get: function(key) {
        var target = this.GET(key);
        if (is(target, Object))
          return jQuery.extend(true, {}, target);
        else if (is(target, Array))
          return target.slice(0);
        return target;
      },
      SET: function(key, val) {
        var value = !is(val) ? null : val;
        var parsed = parse(key), base = parsed[0], tokens = parsed[1];
        var target = this.keys[base];
        this.keys[base] = set(target, tokens.slice(0), value);
        return this;
      },
      set: function(key, val) {
        return this.copy().SET(key, val);
      },
      REMOVE: function(key, val) {
        if (val) {
          var target = this.GET(key);
          if (is(target, Array)) {
            for (tval in target) {
                target[tval] = target[tval].toString();
            }
            var index = $.inArray(val, target);
            if (index >= 0) {
              key = target.splice(index, 1);
              key = key[index];
            } else {
              return;
            }
          } else if (val != target) {
              return;
          }
        }
        return this.SET(key, null).COMPACT();
      },
      remove: function(key, val) {
        return this.copy().REMOVE(key, val);
      },
      EMPTY: function() {
        var self = this;
        jQuery.each(self.keys, function(key, value) {
          delete self.keys[key];
        });
        return self;
      },
      load: function(url) {
        var hash = url.replace(/^.*?[#](.+?)(?:\?.+)?$/, "$1");
        var search = url.replace(/^.*?[?](.+?)(?:#.+)?$/, "$1");
        return new queryObject(url.length == search.length ? '' : search, url.length == hash.length ? '' : hash);
      },
      empty: function() {
        return this.copy().EMPTY();
      },
      copy: function() {
        return new queryObject(this);
      },
      COMPACT: function() {
        function build(orig) {
          var obj = typeof orig == "object" ? is(orig, Array) ? [] : {} : orig;
          if (typeof orig == 'object') {
            function add(o, key, value) {
              if (is(o, Array))
                o.push(value);
              else
                o[key] = value;
            }
            jQuery.each(orig, function(key, value) {
              if (!is(value)) return true;
              add(obj, key, build(value));
            });
          }
          return obj;
        }
        this.keys = build(this.keys);
        return this;
      },
      compact: function() {
        return this.copy().COMPACT();
      },
      toString: function() {
        var i = 0, queryString = [], chunks = [], self = this;
        var encode = function(str) {
          str = str + "";
          str = encodeURIComponent(str);
          if ($spaces) str = str.replace(/%20/g, "+");
          return str;
        };
        var addFields = function(arr, key, value) {
          if (!is(value) || value === false) return;
          var o = [encode(key)];
          if (value !== true) {
            o.push("=");
            o.push(encode(value));
          }
          arr.push(o.join(""));
        };
        var build = function(obj, base) {
          var newKey = function(key) {
            return !base || base == "" ? [key].join("") : [base, "[", key, "]"].join("");
          };
          jQuery.each(obj, function(key, value) {
            if (typeof value == 'object') 
              build(value, newKey(key));
            else
              addFields(chunks, newKey(key), value);
          });
        };
        
        build(this.keys);
        
        if (chunks.length > 0) queryString.push($hash);
        queryString.push(chunks.join($separator));
        
        return queryString.join("");
      }
    };
    
    return new queryObject(location.hash.length && !useQueryString ? location.hash : location.search); //location.search
  };
}(jQuery.query || {}); // Pass in jQuery.query as settings object

/* =============================================================
 * kueri.permanentlink.js 
 * ============================================================ */

var Kueri = Kueri || {};
Kueri.PermanentLink = function (viewModel, sortingEnabled, drillDownCallback, sortCallback) {
	this.viewModel = viewModel;
	this.databaseId = null;
	this.defaultQuery = null;
	this.initialQuery = null;
	this.sortingEnabled = sortingEnabled;
	this.drillDownCallback = drillDownCallback;
	this.sortCallback = sortCallback;
	this.init();
};

Kueri.PermanentLink.prototype = {
	constructor: Kueri.PermanentLink,

	init: function () {
		var self = this;

		var $queryData = $.query();
		self.databaseId = $queryData.get("dbid");
		self.defaultQuery = $queryData.get("q");
		self.initialQuery = {
			pages: this._getArrayHash($queryData, "p"),
			columnNames: this._getArrayHash($queryData, "cn"),
			columnId: this._getArrayHash($queryData, "cid"),
			rowData: this._getArrayHash($queryData, "r")
		};

		self.initialQuery.sortings = self.sortingEnabled ? this._getArrayHash($queryData, "s") : [];

		if (!window.location.hash.length && self.defaultQuery.length) {
			window.location = window.location.toString().replace('?', '#');
		}

		var hashQuery = $.query().remove("dbid").remove("q").remove("p")
			.remove("cn").remove("cid").remove("r").remove("s").remove("token");
		
		window.location.hash = hashQuery.remove("token").toString().slice(1);
	},

	updateHash: function(data, currentPage) {

		var $queryString = $.query();
		if (data.databaseId) {
			$queryString = $queryString.set("dbid", data.databaseId);
		}

		$queryString = $queryString.set("q", data.queryData.keywords);
		var depth = data.isDrillDown ? data.queryData.columnNames.length : 0;

		$queryString = this._storeArrayHash($queryString, "p", depth, currentPage);

		if (this.sortingEnabled) {
			$queryString = this._storeArrayHash($queryString, "s", depth, data.queryData.sorting || '');
		}

		if (!data.isDrillDown) {
			$queryString = $queryString.remove("cn").remove("cid").remove("r");

		} else {

			$queryString = this._storeArrayHash($queryString, "cid", depth - 1, data.queryData.columnId);
			$queryString = this._storeArrayHash($queryString, "r", depth - 1, data.queryData.rowData);
			$queryString = $queryString.set("cn", encodeURIComponent(JSON.stringify(data.queryData.columnNames)));
		}

		window.location.hash = $queryString.remove("token").toString().slice(1);
		this._applyInitialQuery(this.initialQuery, currentPage);
	},

	revertUpHash: function(data) {

		var $queryString = $.query();

		var depth = data.isDrillDown ? data.queryData.columnNames.length : 0;

		$queryString = this._sliceArrayHash($queryString, "p", depth + 1);

		if (this.sortingEnabled) {
			$queryString = this._sliceArrayHash($queryString, "s", depth + 1);
		}

		if (!data.isDrillDown) {
			$queryString = $queryString.remove("cn").remove("cid").remove("r");

		} else {

			$queryString = this._sliceArrayHash($queryString, "cid", depth);
			$queryString = this._sliceArrayHash($queryString, "r", depth);
			$queryString = $queryString.set("cn", encodeURIComponent(JSON.stringify(data.queryData.columnNames)));
		}

		window.location.hash = $queryString.remove("token").toString().slice(1);
	},

	clearHash: function() {
		window.location.hash = $.query().remove("dbid").remove("q").remove("p")
			.remove("cn").remove("cid").remove("r").remove("s").remove("token").toString().slice(1);
	},

	_applyInitialQuery: function (initialQuery, currentPage) {
		var self = this;

		if (initialQuery.pages.length
			&& initialQuery.pages.length > initialQuery.rowData.length
			&& (initialQuery.pages[Math.max(0, initialQuery.rowData.length - 1)] !== currentPage
				|| initialQuery.sortings.length)) {

			var page = initialQuery.pages.shift();

			if (initialQuery.sortings.length) {
				var sortings = initialQuery.sortings.shift();
				if (sortings.length) {
					sortings = sortings.split(',');
					this.viewModel.sortings(sortings);
				}
			}

			if (this.viewModel.results().pager().CurrentPage() !== page) {
				this.viewModel.results().pager().CurrentPage(page);
			} else if (this.viewModel.sortings().length && self.sortCallback) {

				self.sortCallback();
			}

		} else if (initialQuery.rowData.length) {
			var rowData = initialQuery.rowData.shift();

			var matchColumn = ko.utils.arrayFirst(this.viewModel.columns(), function(column) {
				return column.id === initialQuery.columnId[initialQuery.rowData.length];
			});

			var matchRow = ko.utils.arrayFirst(this.viewModel.results().rows, function(row) {
				var rowArr = $.map(row, function(prop) {
					if (JSON.stringify(prop) == "null")
						return [prop];

					return [JSON.stringify(prop).substr(1, JSON.stringify(prop).length - 2)];
				});

				return self._compareArrays(rowData, rowArr);
			});

			if (matchRow && self.drillDownCallback) {
				self.drillDownCallback(matchRow, matchColumn);
			}
		} else if (initialQuery.pages.length) {
			initialQuery.pages = [];
		}
	},

	_compareArrays: function (arr1, arr2) {
		return $(arr1).not(arr2).length == 0 && $(arr2).not(arr1).length == 0;
	},

	_getArrayHash: function ($queryString, name) {

		var p = $queryString.get(name);
		return (p && p.length) ? JSON.parse(decodeURIComponent(p)) : [];
	},

	_storeArrayHash: function ($queryString, name, depth, value) {

		var p = $queryString.get(name);
		var arr = (depth > 0 && p && p.length) ? JSON.parse(decodeURIComponent(p)).slice(0, depth) : [];
		arr = $.merge($.merge([], arr), [value]);

		$queryString = $queryString.set(name, encodeURIComponent(JSON.stringify(arr)));
		return $queryString;
	},

	_sliceArrayHash: function ($queryString, name, depth) {

		var p = $queryString.get(name);
		var arr = (depth > 0 && p && p.length) ? JSON.parse(decodeURIComponent(p)).slice(0, depth) : [];
		$queryString = $queryString.set(name, encodeURIComponent(JSON.stringify(arr)));
		return $queryString;
	}
}

if (window.ko) {
	ko.bindingHandlers.numeral = {
		init: function(element, valueAccessor, bindingAccessor, $data) {
			var value = valueAccessor();
			var columnData = $data;
			var interceptor = ko.computed({
				read: function() {
					try {

						if (columnData.t == "number") {
							if (parseInt(ko.unwrap(value)) < value)
								return numeral(ko.unwrap(value)).format('0,0.00');

							return numeral(ko.unwrap(value)).format('0,0');
						}
					} catch (e) {

					}

					return value;
				},
				write: function(newValue) {
					if ($.trim(newValue) == '')
						value("0");
					else
						value(numeral().unformat(newValue));
					value.valueHasMutated();
				}
			}).extend({ notify: 'always' });

			if (element.tagName.toLowerCase() == 'input')
				ko.applyBindingsToNode(element, {
					value: interceptor
				});
			else
				ko.applyBindingsToNode(element, {
					text: interceptor
				});
		}
	}
}
if (window.ko) {
	var templateFromUrlLoader = {
		loadTemplate: function(name, templateConfig, callback) {
			if (templateConfig.fromUrl) {
				// Uses jQuery's ajax facility to load the markup from a file
				var $resource = $("link[rel='external'][href*='" + templateConfig.fromUrl + "']");
				var fullUrl = $resource.attr('href');
				$.get(fullUrl, function(markupString) {
					// We need an array of DOM nodes, not a string.
					// We can use the default loader to convert to the
					// required format.
					ko.components.defaultLoader.loadTemplate(name, markupString, callback);
				});
			} else {
				// Unrecognized config format. Let another loader handle it.
				callback(null);
			}
		}
	};

// Register it
	ko.components.loaders.unshift(templateFromUrlLoader);
}
/* =============================================================
 * kueri.savedquerymodel.js 
 * ============================================================ */

var Kueri = Kueri || {};
Kueri.SavedQueryModel = function(defaultDatabaseId, searchBox) {
	var box = $(searchBox);

	this.queries = ko.observableArray([]);

	this.applySavedQueries = function (dbId) {
		this.queries.removeAll();

		if (window.savedQueryData && window.savedQueryData[dbId] && $.isArray(window.savedQueryData[dbId])) {
			this.queries.valueWillMutate();
			ko.utils.arrayPushAll(this.queries(), window.savedQueryData[dbId]);
			this.queries.valueHasMutated();
		}
	};

	this.openSavedQuery = function (query, e) {
		e && e.preventDefault();
		box.searchBox("clear");
		window.location.hash = query.href;
		var databaseId = defaultDatabaseId;

		if (Kueri.PermanentLink) {
			var pLink = new Kueri.PermanentLink();
			if (pLink.databaseId) {
				databaseId = pLink.databaseId;
			}
			box.searchBox('setQuery', pLink.defaultQuery, false, databaseId);
		} else {
			box.searchBox('setQuery', query.href.slice(1), false, databaseId);
		}
	};

	return this;
};
/* =============================================================
 * kueri.tablelayoutmodel.js 
 * ============================================================ */

var Kueri = Kueri || {};
Kueri.TableLayoutModel = function(savedQueryModel) {

	this.parentResults = ko.observableArray([]);
	this.columns = ko.observableArray([]);
	this.sortings = ko.observableArray([]);
	this.savedQuery = ko.observable(savedQueryModel);
	this.results = ko.observable();
	this.tooManyColumns = ko.observable(false);
	this.queryText = ko.observable();
	this.queryRan = ko.observable();
	
	this.clear = function () {
		this.columns([]);
		this.sortings([]);
		this.parentResults([]);
		this.results(null);
		this.tooManyColumns(false);
		this.queryText(null);
		this.queryRan(null);
	};

	return this;
};
if (window.ko) {
	ko.components.register('kueri-tablelayout-widget', {
		viewModel: {
			createViewModel: function(params, componentInfo) {
				return new Kueri.TableLayoutWidgetModel(params.value, params.searchBox);
			}
		},
		template: { fromUrl: 'kueri.tablelayout.widget.html', maxCacheAge: 1234 }
	});
}
/* =============================================================
 * kueri.tablelayoutwidgetmodel.js 
 * ============================================================ */

var Kueri = Kueri || {};
Kueri.TableLayoutWidgetModel = function(viewModel, searchBox) {
	var box = $(searchBox);

	this.model = viewModel;

	this.hasMultipleColumns = ko.computed(function () {
		var visibleColumnsCount = 0;
		$.each(this.columns(), function (i, v) {
			if (!v.h) {
				visibleColumnsCount++;
			}
		});

		return visibleColumnsCount > 1;
	}, viewModel);



	this.applyResults = function (data, pageSize) {
		if (!data.isDrillDown) {
			viewModel.parentResults([]);
		}
		if (!data.queryData.sorting) {
			viewModel.sortings([]);
		}

		var currentPage = viewModel.results() ? viewModel.results().pager().CurrentPage() : 1;

		var sourceColumns = data.query[0].columns;
		$.each(sourceColumns, function (i, v) { v.sorting = ko.observable(); });
		viewModel.columns(sourceColumns);
		viewModel.sortings.valueHasMutated();

		viewModel.tooManyColumns(data.tooManyColumns);
		viewModel.queryText(data.queryText);
		viewModel.queryRan(data.queryRan);

		viewModel.results($.extend(data.results, {
			pager: ko.pager(function () {
				return data.results.total;
			}, pageSize, data.results.from > 1 ? currentPage : 1)
		}));

		viewModel.results().pager().CurrentPage.subscribe(function (newValue) {
			box.searchBox('getPage', newValue, viewModel.sortings().join());
		});

		return currentPage;
	};


	this.sort = function (column, second, ev) {

		if (!ev.ctrlKey) {
			viewModel.sortings.removeAll();

			$.each(viewModel.columns(), function (i, v) {
				if (v.id !== column.id) {
					v.sorting(null);
				}
			});
		}

		switch (column.sorting()) {
			case 'fa-sort-desc':
				viewModel.sortings.remove('O' + column.id + 'D');
				break;
			case 'fa-sort-asc':
				viewModel.sortings.remove('O' + column.id + 'A');
				viewModel.sortings.push('O' + column.id + 'D');
				break;
			default:
				viewModel.sortings.push('O' + column.id + 'A');
				break;
		}

		this.applySorting();
	};

	this.applySorting = function () {
		box.searchBox('sort', viewModel.sortings().join());
	};

	viewModel.sortings.subscribe(function () {
		$.each(viewModel.columns(), function (i, v) {
			$.each(viewModel.sortings(), function (iS, vS) {
				var columnId = vS.substr(1, vS.length - 2);
				if (v.id == columnId) {
					if (vS[vS.length - 1] == 'A') {
						v.sorting('fa-sort-asc');
					}
					else if (vS[vS.length - 1] == 'D') {
						v.sorting('fa-sort-desc');
					} else {
						v.sorting(null);
					}
				}
			});
		});
	});

	this.drillDown = function (column) {

		var parentData = {
			columns: ko.observableArray(viewModel.columns()),
			sortings: ko.observableArray(viewModel.sortings()),
			results: ko.observable(viewModel.results()),
			drillDownRow: ko.observable(this),
			drillDownColumn: column
		};

		parentData.hasMultipleColumns = ko.computed(function () {
			var visibleColumnsCount = 0;
			$.each(this.columns(), function (i, v) {
				if (!v.h) {
					visibleColumnsCount++;
				}
			});

			return visibleColumnsCount > 1;
		}, parentData);


		viewModel.parentResults.push(parentData);

		viewModel.sortings([]);
		viewModel.results(null);
		box.searchBox('runDrillDown', column, this);
	};

	this.drillUp = function (parentResult) {
		var currentResult = null;
		var data = null;
		while (parentResult != currentResult) {

			currentResult = viewModel.parentResults.pop();
			data = box.searchBox('runDrillUp',
				currentResult.drillDownColumn,
				currentResult.drillDownRow(),
				currentResult.sortings().join());
		}
		viewModel.columns(parentResult.columns());
		viewModel.sortings(parentResult.sortings());
		viewModel.results(parentResult.results());

		if (Kueri.PermanentLink) {
			var pLink = new Kueri.PermanentLink();
			pLink.revertUpHash(data);
		}
	};

	this.downloadCsv = function() {
		box.searchBox('downloadCsv');
	}

	return this;
};
/* =============================================================
 * kueri.tokeninitializer.js 
 * ============================================================ */

var Kueri = Kueri || {};
Kueri.TokenInitializer = function(options) {
	var defaults = {
		userName: null,
		pwd: null,
		readFromUrl: false,
		tokenName: 'searchtoken',
		loginUrl: 'login.html',
		requestUrl: 'http://demo.simpleql.com/admin/xmlrpc',
		errorReceived: function(error) {
			var message = error.message;
			if (error.extra) {
				for (var key in error.extra) {
					if (error.extra.hasOwnProperty(key)) {
						message += ", " + key + ": " + error.extra[key];
					}
				}
			}

			alert(message);
		}
	};

	var settings = $.extend({}, defaults, options);

	this.getToken = function (force) {
		var token = localStorage.getItem(settings.tokenName);
		if (!token || !token.length || force) {

			if (settings.userName && settings.pwd) {
				token = this.getDemoToken(settings.userName, settings.pwd);
				if (token) {
					localStorage.setItem(settings.tokenName, token);
				}
			} else {
				this.redirectToLogin();
			}
		}

		return token;
	};

	this.rebuild = function () {
		localStorage.removeItem(settings.tokenName);
		return this.getToken();
	};

	this.redirectToLogin = function () {
		var returnUrl = window.location.href.toString();

		if ($.query(true).get('token')) {
			returnUrl = returnUrl.replace(window.location.search, $.query(true).remove('token').toString());
		}

		window.location = settings.loginUrl + '?returnurl=' + encodeURIComponent(returnUrl);
	};

	this.getDemoToken = function (userName, pwd) {

		var tokenXmlRpc = function (process, method, params) {
			var xmlDoc = $.xmlrpc.document(method, params, 'xmlnsex');
			var xmlData = null;
			if ("XMLSerializer" in window) {
				xmlData = new window.XMLSerializer().serializeToString(xmlDoc);
			} else {
				// IE does not have XMLSerializer
				xmlData = xmlDoc.xml;
			}
			xmlData = xmlData.replace('xmlnsex', 'xmlns:ex');

			var xhr = $.ajax({
				type: "POST",
				url: settings.requestUrl,
				data: xmlData,
				async: false,
				success: function (data) {
					try {
						var json = $.xmlrpc.parseDocument(data);

						if (json.status == 'ok') {
							process(json);
						} else if (json.status == 'error') {

							settings.errorReceived(json.error);
						}
					} catch (e) {
						alert(e);
					}
				},
				dataType: "xml"
			});

			return xhr;
		};

		var demoToken = null;
		tokenXmlRpc(function (json) {
			demoToken = json.token;
		}, 'server.login', [userName, pwd]);

		return demoToken;
	};

	if (settings.readFromUrl && !(settings.userName && settings.pwd)) {
		var tokenFromUrl = $.query(true).get('token');

		if (tokenFromUrl) {
			localStorage.setItem(settings.tokenName, tokenFromUrl);
		}
	}

	return this;
};


/* =============================================================
 * kueri.searchinitializer.js 
 * ============================================================ */

var Kueri = Kueri || {};
Kueri.SearchInitializer = function(options) {
	var defaults = {
		databaseId: 199,
		pageSize: 20,
		searchBoxSelector: '#',
		tableLayoutSelector: '#',
		setFocusOnInit: true,
		showDatabases: false,
		itemsCapacity: 10,
		debug: false,
		requestUrl: "",
		downloadCsvUrl: "",
		beforeRunQuery: function () { },
		extendModel: function (model) { },
		errorReceived: function (data) {
			if (data.id == 8) {
				if (!settings.tokenBuilder) {
					alert(data.message);
				}
			} else {
				alert(data.message);
			}
		},
		tokenBuilder: null
	};

	var settings = $.extend({}, defaults, options);
	var token = settings.tokenBuilder ? settings.tokenBuilder.getToken() : 'anonymous';

	var databaseId = settings.databaseId;
	var output = {};
	if (window.ko) {
		var getLayoutModel = function () {
			var $componentContext = ko.contextFor($('kueri-tablelayout-widget').find('div:first')[0]);
			return $componentContext ? $componentContext.$component : null;
		};

		var saveQueryViewModel = new Kueri.SavedQueryModel(settings.databaseId, settings.searchBoxSelector);
		var dataViewModel = new Kueri.TableLayoutModel(saveQueryViewModel);
		settings.extendModel(dataViewModel);

		$(settings.tableLayoutSelector).each(function () {
			ko.applyBindings(dataViewModel, this);
		});
		output.model = dataViewModel;

		if (Kueri.PermanentLink) {
			var pLink = new Kueri.PermanentLink(dataViewModel, true,
				function(matchRow, matchColumn) {
					getLayoutModel().drillDown.call(matchRow, matchColumn);
				},
				function() {
					getLayoutModel().applySorting();
				});

			if (pLink.databaseId) {
				databaseId = pLink.databaseId;
			}
		}

		saveQueryViewModel.applySavedQueries(databaseId);
	}

	var boxSettings = $.extend({}, settings, {
		defaultQuery: pLink ? pLink.defaultQuery : null,
		databaseId: databaseId,
		token: token
	});

	var box = $(settings.searchBoxSelector).searchBox(boxSettings)
		.on("searchbox:results", function (ev, data) {

			var currentPage = window.ko ? getLayoutModel().applyResults(data, settings.pageSize) : 0;
			pLink && pLink.updateHash(data, currentPage);
		})
		.on("searchbox:clear", function (ev, data) {

			window.ko && dataViewModel.clear();
			pLink && pLink.clearHash();
		})
		.on("searchbox:error", function (ev, data) {
			if (data.id == 8) {
				if (settings.tokenBuilder) {
					var updatedToken = settings.tokenBuilder.rebuild();
					if (updatedToken) {
						box.searchBox('setToken', updatedToken);
					}
				}
			}

			settings.errorReceived(data);
		})
		.on("searchbox:abort", function () {
			toastr.success("Query aborted", null, { timeOut: 1000 });
		})
		.on("searchbox:databaseChanged", function (ev, dbId) {
			window.ko && saveQueryViewModel.applySavedQueries(dbId);
		})
		.on("searchbox:beforeRunQuery", function (ev, args) {
			settings.beforeRunQuery(ev, args);
		});

	if (settings.tokenBuilder) {
		box.searchBox('verifyToken');
	}

	output.box = box;

	if (settings.setFocusOnInit && !(pLink && pLink.defaultQuery && pLink.defaultQuery.length)) {
		box.searchBox('setFocus');
	}

	return output;
};

