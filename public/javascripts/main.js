$( document ).ready(function() {

    /*
    Basic interactive animations
    */
    $("#about_btn").on("click", function() {
        $("#about").toggle(100);
    });

    $("#upload").on("click", function() {
        $("#drop_area").toggle(100);
    });

    $(".close_btn").on("click", function() {
        $(this).parent().hide(100);
    });

    /*
    Generate query for showing tables and lenses
    */
    $(document).on("click", ".table_link, .lens_link", function() {
        var table = $(this).html();
        var query = "SELECT * FROM "+table+";";

        $("#query_textarea").val(query);
        $("#query_btn").trigger("click");
    });

    /*
    Change the working database
    */
    $(".db_link").on("click", function() {
        $("#change_db_field").val($(this).html());
        $("#change_db_form").submit();
    });

    /*
    Create a new database
    */
    $("#create_database").on("click", function() {
        var db = prompt("Please enter a name for the new database", "awesomedb");
        var existing_dbs = new Array();

        // Check for valid name
        if(!db.match(/^\w+$/))
            alert("That is not a valid name, please try again");

        db += ".db";

        $(".db_link").each(function() {
            existing_dbs.push($(this).html());
        });

        if($.inArray(db, existing_dbs) != -1) {
            alert("A database with the name "+db+" already exists");
        }
        else {
            $("#create_db_field").val(db);
            $("#create_db_form").submit();
        }
    });


    /*
    Plugin Configurations
    */

    /*
    ColResizable
    http://www.bacubacu.com/colresizable/

    Resizable columns, automatic adjustment
    for equally spaced columns
    */
    $("#result_table").colResizable( {
        liveDrag: true,
        minWidth: 10
    });

    /*
    Dropzone
    http://www.dropzonejs.com

    Enables csv upload
    */
    Dropzone.options.myAwesomeDropzone = {
      maxFilesize: 100000, // MB
      acceptedFiles: ".csv",
      addRemoveLinks: true,
      init: function() {
        this.on('success', function () {
            var acceptedFiles = [];
            this.getAcceptedFiles().forEach(function (element, index, array) {
                acceptedFiles.push(element.name.replace(/\.csv/i, ""));
            });
            var listedFiles = [];
            $(".table_link").each( function() {
                listedFiles.push( $(this).html() );
            });
            acceptedFiles.forEach(function (element, index, array) {
                var i;
                var found = false;
                for(i= 0; i<listedFiles.length; i++) {
                    if(element.toUpperCase() === listedFiles[i].toUpperCase()) {
                        found = true;
                        break;
                    }
                }

                if(!found) {
                    $("#select_table .divider").before('<li><a class="table_link ">'+element+'</a></li>');
                }
            });
        });
        this.on("error", function() {
            var span = $("span[data-dz-errormessage]");
            span.html("There is no table with this name in the current database!");
        });
      }
    };

    /*
    Tooltipster
    http://iamceege.github.io/tooltipster/

    For tooltips
    */

    // Cell level uncertainty
    $(".non_deterministic_cell").one("click", function(e) {
        $(this).tooltipster({
            animation: 'grow',
            contentAsHTML: 'true',
            delay: 10,
            interactive: true,
            minWidth: 350,
            maxWidth: 350,
            position: 'bottom',
            theme: 'tooltipster-shadow',
            trigger: 'click',
            functionInit: function(origin, content) {

                // Get content through ajax queries

                var col_index = origin.prevAll().length - 1;
                var col = origin.parents('table').find('th').eq(col_index).text();
                var row = origin.parent().children(".rowid_col").html();
                var query = $("#last_query_field").val().replace(";","");
                var db = $("#db_field").val();

                var bounds = null;
                var stddev = null;
                var mean = null;
                var examples = null;
                var causes = [];

                var fault = false;
                var errormessage = "";

                var explain_query = 'explainCol?query='+query+';&row='+row+'&ind='+ col_index
                                        +'&db='+db;

                if (content == null) {

                    $.when(
                        $.get(explain_query, function (res) {
                            console.log(res);
                            res = JSON.parse(res)
                            if(res.hasOwnProperty('error')) {
                                fault = true;
                                errormessage += res.error+'<br/>';
                            }
                            else {
                                if(res.hasOwnProperty('bounds')){
                                    bounds = res['bounds']
                                }
                                if(res.hasOwnProperty('mean')){
                                    mean = res['mean']
                                }
                                if(res.hasOwnProperty('stddev')){
                                    stddev = res['stddev']
                                }
                                if(res.hasOwnProperty('examples')){
                                    console.log("Examples");
                                    examples = res['examples']
                                }
                                causes = res['reasons']
                            }
                        })
                    ).then( function() {
                        if(fault) {
                            origin.tooltipster('content', 'Something went wrong!<br/><br/>'+errormessage);
                        }
                        else {
                            var tooltip_template = '<table class="table tooltip_table">'+
                                                  '<tbody>'+
                                                      '<tr>'+
                                                          '<th scope="row">Possibilities</th>'+
                                                          '<td>'+examples+'</td>'+
                                                      '</tr>'

                            if(bounds){
                              tooltip_template +=     '<tr>'+
                                                          '<th scope="row">Bounds</th>'+
                                                          '<td class="number">'+bounds+'</td>'+
                                                      '</tr>'
                            }
                            if(mean){
                              tooltip_template +=     '<tr>'+
                                                          '<th scope="row">Mean</th>'+
                                                          '<td class="number">'+mean+'</td>'+
                                                      '</tr>'
                            }
                            if(stddev){
                              tooltip_template +=     '<tr>'+
                                                          '<th scope="row">Std. Dev.</th>'+
                                                          '<td class="number">'+stddev+'</td>'+
                                                      '</tr>'
                            }
                                                      
                            tooltip_template +=       '<tr>'+
                                                          '<th scope="row">Reasons</th>'+
                                                          '<td><ul>'+listify(causes)+'</ul></td>'+
                                                      '</tr>'+
                                                  '</tbody>'+
                                              '</table>';
                            origin.tooltipster('content', tooltip_template);
                        }
                    });

                    // this returned string will overwrite the content of the tooltip for the time being
                    return '<b>Loading...</b>';
                }
                else {
                    // return nothing : the initialization continues normally with its content unchanged.
                }
            },
        });

        // User click only attached the listener, now trigger click
        // to actually display the tooltip
        $(this).click();
    });

    // Row level uncertainty
    $(".non_deterministic_row").one("click", function(e) {
        $(this).tooltipster({
            animation: 'grow',
            contentAsHTML: 'true',
            delay: 10,
            interactive: true,
            minWidth: 350,
            maxWidth: 350,
            position: 'top-right',
            theme: 'tooltipster-shadow',
            trigger: 'click',
            functionInit: function(origin, content) {

                var row = origin.children(".rowid_col").html();
                var query = $("#last_query_field").val().replace(";","");
                var db = $("#db_field").val();

                var prob;
                var causes = [];

                var fault = false;
                var errormessage = "";

                var explain_query = 'explainRow?query='+query+';&row='+row
                                        +'&db='+db;

                if (content == null) {
                    $.when(
                        $.get(explain_query, function (res) {
                            console.log(res)
                            res = JSON.parse(res)
                            if(res.hasOwnProperty('error')) {
                                fault = true;
                                errormessage += res.error+'<br/>';
                            }
                            else {
                                causes = res["reasons"];
                                prob = res["probability"];
                            }
                        })
                    ).then( function() {
                        if(fault) {
                            origin.tooltipster('content', 'Something went wrong!<br/><br/>'+errormessage);
                        }
                        else {
                            var tooltip_template = '<table class="table tooltip_table">'+
                                                  '<tbody>'+
                                                      '<tr>'+
                                                          '<th scope="row">Confidence</th>'+
                                                          '<td class="number">'+prob+'</td>'+
                                                      '</tr>'+
                                                      '<tr>'+
                                                          '<th scope="row">Reasons</th>'+
                                                          '<td><ul>'+ listify(causes) +'</ul></td>'+
                                                      '</tr>'+
                                                  '</tbody>'+
                                              '</table>';
                            origin.tooltipster('content', tooltip_template);
                        }
                    });

                    // this returned string will overwrite the content of the tooltip for the time being
                    return '<b>Loading...</b>';
                }
                else {
                    // return nothing : the initialization continues normally with its content unchanged.
                }
            },
        });

        $(this).click();
    });


    function get_query_name(on_ready) 
    {
        var query = $("#last_query_field").val().replace(";.*","");
        var db = $("#db_field").val();
        var name_query = 'queryName?query='+query+';&db='+db;

        $.get(name_query, function (res) {
            console.log(res);
            if(typeof res == "string"){
                res = JSON.parse(res)
            }
            if(res.hasOwnProperty('error')) {
                fault = true;
                errormessage += res.error+'<br/>';
            } else {
                on_ready(res["result"])
            }
        })         
    }

    function get_query_schema(on_ready) 
    {
        var query = $("#last_query_field").val().replace(";.*","");
        var db = $("#db_field").val();
        var schema_query = 'querySchema?query='+query+';&db='+db;

        $.get(schema_query, function (res) {
            console.log(res);
            if(typeof res == "string"){
                res = JSON.parse(res)
            }
            if(res.hasOwnProperty('error')) {
                fault = true;
                errormessage += res.error+'<br/>';
            } else {
                on_ready(res);
            }
        })         
    }

    /* Lens create buttons */
    $("#type_inference_btn").click( function() {
        get_query_name(function(name) {
            $("#ti_lens_name").val(name+"TYPED");
            $("#black-box").show();
            $("#ti_lens_div").show();
    
            $("#black-box").click( function() {
                $("#ti_lens_div").hide();
                $(this).hide();
            });
        })
    });

    $("#ti_lens_create_btn").click( function() {
        var name = $("#ti_lens_name").val();
        if(name === "") {
            alert("Please enter a name for the lens");
            return;
        }

        var ratio = $("#ti_lens_param").val();

        var subquery = $("#last_query_field").val();
        var createlens = "CREATE LENS "+name+" AS "+subquery+" WITH TYPE_INFERENCE("+ratio+");"

        var select = "SELECT * FROM "+name+";"
        var query = createlens+"\n"+select;

        $("#query_textarea").val(query);
        $("#query_btn").trigger("click");
    });

    $("#missing_value_btn").click( function() {
        get_query_name(function(name) {
            $("#mv_lens_name").val(name+"INTERPOLATED");
            $("#black-box").show();
            $("#mv_lens_div").show();

            var dropdown = $("#mv_lens_param");
            if(dropdown.children("option").length <= 0) {
                $("#result_table").children("thead").children().children().not(".rowid_col, .row_selector").each( function () {
                    dropdown.append($("<option />").val($(this).html()).text($(this).html()));
                });
            }

            $("#black-box").click( function() {
                $("#mv_lens_div").hide();
                $(this).hide();
            });
        })
    });

    $("#mv_lens_create_btn").click( function() {
        var name = $("#mv_lens_name").val();
        if(name === "") {
            alert("Please enter a name for the lens");
            return;
        }

        var param = $("#mv_lens_param").val();
        param = param.map( function (val) {
            return "'"+val+"'";
        });

        var subquery = $("#last_query_field").val();
        var createlens = "CREATE LENS "+name+" AS "+subquery+" WITH MISSING_VALUE("+param+");"

        var select = "SELECT * FROM "+name+";"
        var query = createlens+"\n"+select;

        $("#query_textarea").val(query);
        $("#query_btn").trigger("click");
    });

    $("#schema_matching_btn").click( function() {
        get_query_name(function(name) {
            $("#sm_lens_name").val(name+"MATCHED");
            $("#black-box").show();
            $("#sm_lens_div").show();

            $("#black-box").click( function() {
                $("#sm_lens_div").hide();
                $(this).hide();
            });
        })
    });

    $("#sm_lens_create_btn").click( function() {
        var name = $("#sm_lens_name").val();
        if(name === "") {
            alert("Please enter a name for the lens");
            return;
        }

        var param = $("#sm_lens_param").val();
        param = param.split("[")[1].replace("]", "");
        console.log(param)
        param = param.split(", ").map(function(f){return "'"+f+"'"}).join(", ")
        console.log(param)

        var subquery = $("#last_query_field").val();
        var createlens = "CREATE LENS "+name+" AS "+subquery+" WITH SCHEMA_MATCHING("+param+");"

        var select = "SELECT * FROM "+name+";"
        var query = createlens+"\n"+select;
        console.log(createlens)

        $("#query_textarea").val(query);
        $("#query_btn").trigger("click");
    });



    // assigns a value to each item in the list to later be used
    // to findout which one was selected
    $('#ad_list button').each(function(i,el){
        el.value = i+1;
    });

    //get the table name you selected and the shcma for the lastest query text
     $(".add_data_btn").click( function() {
        var table = $(this).html();
        get_query_schema(function(schema) {         // gets the schema from latest query
            var ad_lens_name = table+"ADDED";
            var qSchema = schema;
            var schemaString = "";

            for (i = 0; i < qSchema.length; i++) { 
                if(i > 0){ schemaString += ", "; }
                schemaString += "'"+qSchema[i].name +" "+ qSchema[i].type+"'";
            }

            var origquery = $("#last_query_field").val();                   //[       ]name until i get the real selected name
            var createlens = "CREATE LENS "+ad_lens_name+" AS SELECT * FROM "+table+" WITH SCHEMA_MATCHING("+schemaString+");" //needs to be schema of last query field* is currently nothign

            var select = origquery+" UNION ALL SELECT * FROM "+ad_lens_name+";";
            var query = createlens+"\n"+select;

            console.log(query)
            $("#query_textarea").val(query);
            $("#query_btn").trigger("click");
        })

        //var ad = document.getElementById("ad_list");
        //var selected_table = ad.buttons[ad.selectedIndex].text;

        //var name = $("#sm_lens_name").val();
        

    });

    Mimir.visualization.drawGraph();

    // NLP and Discovery module changes

    // This populates the SQL text area after choosing the NLP, can be used to trigger query click as well

    $("#nlp_confirm_btn").click( function() {
        var nlp_query = $('#sqlData').text();
        $("#query_textarea").val(nlp_query);
        // $("#query_btn").trigger("click");
    });

    // Letting the user choose between NLP and Discovery
    $('input:radio[name="nlp_choice"]').change(function() {

        if ($(this).val() == 'configured') {
            $("#kueri_div").show()
            $("#nlp_confirm_btn").show()
            $("#nlp_back_btn").show()
            $("#ontology_div").hide()
        } else if ($(this).val() == 'not_configured') {
            $("#kueri_div").hide()
            $("#nlp_confirm_btn").hide()
            $("#nlp_back_btn").show()
            $("#ontology_div").show()
        }

        $("#nlp_choice_div").hide()
    });

    $('#nlp_back_btn').click(function() {
        $("#nlp_choice_div").show()
        $("#kueri_div").hide()
        $("#nlp_confirm_btn").hide()
        $("#ontology_div").hide()
    });

    $('#clearContents').click(function() {
        $('#discovery_field').val('');
    });

    // Typo detection in discovery search box
    var dictionary = new Typo("en_US", false, false, { dictionaryPath: "assets/javascripts/typo/dictionaries" });

    $('#searchContents').click(function() {
        var searchElement = $('#discovery_field').val()
        var is_spelled_correctly = dictionary.check(searchElement)
        if(is_spelled_correctly) {
            $('#discovery_field').removeClass('errorClass')

            $.get('/discover', {'arg': searchElement})
                .success(function(result) {
                    if(result === null) {
                        $('#ontologyTree').text(" The table you are looking for is probably not there in our database.");
                        $('#ontologyViz').hide()
                    }
                    else {
                        $('#ontologyTree').text(" The table you are looking for is probably " + result);

                        $.get('/discoverViz')
                            .success(function(result) {
                                var jsonResult = JSON.parse("["+result+"]")
                                $('#ontologyViz').empty()
                                $('#ontologyViz').html( Mimir.discovery.drawTree(jsonResult[0]))
                                $('#ontologyViz').show()
                            })
                            .error(function(jqXHR, textStatus, errorThrown) {
                                $('#ontologyViz').html("Error thrown is " + errorThrown);
                                $('#ontologyViz').show()
                            })

                    }
                })
                .error(function(jqXHR, textStatus, errorThrown) {
                    $('#ontologyTree').text("Error thrown is " + errorThrown);
                });
        }
        else {
            $('#discovery_field').addClass('errorClass')
            $('#ontologyTree').text("");
            $('#ontologyViz').hide()
        }
    });

    // Initialize kueri search
    var kueriSearch = new Kueri.SearchInitializer({
        searchBoxSelector: '#searchBoxNormal',
        showDatabases: true,
        requestUrl: 'http://localhost/admin/api',
        receiveResults: false
    });

    $("#searchBoxNormal").on("searchbox:results", function (ev, data) {
        $('#sqlData').text(data.query[0].q);
    });

    var context = this;
    var getSql = function (queryText) {
        kueriSearch.getSuggestions(context, { query1: queryText, query2: '' },
            function(data) {
                var cannotTranslate = true;
                $.each(data.suggests, function(i, v) {
                    if ((v.type == kueriSearch.SUGGEST_UNSUPPORTED) || (v.type == kueriSearch.SUGGEST_AMBIGUITY) || (v.type == kueriSearch.SERVICE_UNAVAILABLE)) {
                        $('#sqlData').text(v.text);
                        cannotTranslate = false;
                        return false;
                    } else if ((v.type == kueriSearch.SUGGEST_QUERY) || (v.type == kueriSearch.SUGGEST_TO_RUN)) {
                        kueriSearch.submitSuggestion(context, v.query, queryText);
                        cannotTranslate = false;
                        return false;
                    }
                });

                if (cannotTranslate) {
                    $('#sqlData').text('Cannot translate this input to SQL');
                }
            },
            true);
    };

    // searchBoxNormal's styling changes on page load, reverting it to be of parity with existing styles
    $('#searchBoxNormal .db-container .dropdown-toggle').removeClass('btn-inverse').addClass('btn-default');

});

$(document).ajaxStart(function() {
    $("#loader").show();
});

$(document).ajaxStop(function() {
    $("#loader").hide();
});

/*
Utility functions
*/
function listify(causes) {
    var result = $("<div>");
    $.each(causes, function(i, v){
        var approve = $("<a>", {href: "#", class: "ttOption approve", text: "Approve"});
        var fix = $("<a>", {href: "#", class: "ttOption fix", text: "Fix"});
        var tag = $("<li>", {class: "paperclip", text: causes[i]['english'] + " |"})
                    .attr("onmouseover", "highlightFlowNode(this)")
                    .attr("onmouseout", "reverthighlight(this)");
        var lensType = $("<input>").attr("type", "hidden").val(causes[i]['source']);
        tag.append(approve).append(fix).append(lensType);
        result.append(tag);
    });
    return result.html();
}

function highlightFlowNode(reason){
    var text = $(reason).find("input").val();
    var nodeDivs = getFlowNodes(text);
    $(nodeDivs).find("circle").attr("fill", "orange").attr("r", Mimir.visualization.RADIUS + 3);
    $(nodeDivs).find("text").attr("fill", "brown").attr("font-size", Mimir.visualization.ZOOMFONTSIZE);
}

function reverthighlight(reason){
    var text = $(reason).find("input").val();
    var nodeDivs = getFlowNodes(text);
    $(nodeDivs).find("circle").attr("fill", "black").attr("r", Mimir.visualization.RADIUS);
    $(nodeDivs).find("text").attr("fill", "black").attr("font-size", Mimir.visualization.FONTSIZE);
}

function getFlowNodes(label){
    var nodes = $(".node");
    var selectedNodes = [];
    $.each(nodes, function(i, v){
        var text = v.children[1].textContent;
        if(text == label)
            selectedNodes.push(v);
    });
    return selectedNodes;
}
