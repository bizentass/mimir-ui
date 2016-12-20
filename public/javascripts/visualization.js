function node() {
    this.children = [];
    this.name = "";
    this.position = {};
    this.args = [];
}

node.prototype.links = function() {
    var self = this;
    if (self.children.length == 0)
        return [];
    var arr = [{
        source: self.position,
        target: self.children[0].position
    }].concat(self.children[0].links());
    if (self.children.length > 1)
        arr = arr.concat([{
            source: self.position,
            target: self.children[1].position
        }]).concat(self.children[1].links());
    return arr;
}

node.prototype.getAllPositions = function() {
    var arr = [this.position]
    switch (this.children.length) {
        case 1:
            arr = arr.concat(this.children[0].getAllPositions());
            break;
        case 2:
            arr = arr.concat(this.children[0].getAllPositions())
                .concat(this.children[1].getAllPositions());
            break;
        default:
            break;
    }
    return arr;
}

node.prototype.height = function() {
    if (this.children.length == 0)
        return 1;
    if (this.children.length == 1)
        return this.children[0].height() + 1;
    return Math.max(this.children[0].height(), this.children[1].height()) + 1;
}

var Mimir = {};
Mimir.visualization = {
    XDIFF: 100,
    YDIFF: 80,
    WIDTH: 600,
    HEIGHT: 200,
    RADIUS: 5,
    FONTSIZE: "0.7em",
    ZOOMFONTSIZE: "1em",

    propagatePositions: function(node, xVal, yVal, div) {
        var xdiff = Mimir.visualization.XDIFF;
        var ydiff = Mimir.visualization.YDIFF;
        node.position = {
            x: xVal,
            y: yVal,
            name: node.name,
            args: node.args
        };
        if (node.children.length == 0)
            return node;
        else if (node.children.length == 1)
            node.children = [Mimir.visualization.propagatePositions(node.children[0], xVal - xdiff, yVal, div)];
        else {
            node.children = [Mimir.visualization.propagatePositions(node.children[0], xVal - xdiff, yVal + ydiff / (2 * div), 2 * div),
                Mimir.visualization.propagatePositions(node.children[1], xVal - xdiff, yVal - ydiff / (2 * div), 2 * div)
            ];
        }
        return node;
    },

    createTree: function(flow) {
        var root = new node();
        root.name = flow.name;
        root.args = flow.args;
        var rootChild = [];
        for (var i = 0; i < flow.children.length; i++) {
            rootChild.push(Mimir.visualization.createTree(flow.children[i]));
        }
        root.children = rootChild;
        return root;
    },

    graph: function(node) {
        Mimir.visualization.XDIFF = Mimir.visualization.WIDTH/(node.height() + 1);
        var width = Mimir.visualization.WIDTH, height = Mimir.visualization.HEIGHT,
        radius = Mimir.visualization.RADIUS, fontSize = Mimir.visualization.FONTSIZE,
        zoomFontSize = Mimir.visualization.ZOOMFONTSIZE;

        node = Mimir.visualization.propagatePositions(node, width - Mimir.visualization.XDIFF, height / 2, 1);
        var nodes = node.getAllPositions();
        var links = node.links();

        var vis = d3.select("#graph")
            .append("svg:svg")
            .attr("class", "stage")
            .attr("width", width)
            .attr("height", height);

        var uinodes = vis.selectAll("circle.node")
            .data(nodes)
            .enter().append("g")
            .attr("class", "node")
            .on("mouseover", function(d, i) {
                d3.select(this).selectAll("circle")
                    .transition()
                    .duration(250)
                    .attr("r", radius + 3)
                    .attr("fill", "orange");

                d3.select(this).select("text")
                    .transition()
                    .duration(250)
                    .attr("fill", "brown")
                    .attr("font-size", zoomFontSize);
            })
            .on("mouseout", function(d, i) {
                d3.select(this).selectAll("circle")
                    .transition()
                    .duration(250)
                    .attr("r", radius)
                    .attr("fill", "black");

                d3.select(this).select("text")
                    .transition()
                    .duration(250)
                    .attr("fill", "black")
                    .attr("font-size", fontSize);
            });

        uinodes.append("svg:circle")
            .attr("cx", function(d) {
                return d.x;
            })
            .attr("cy", function(d) {
                return d.y;
            })
            .attr("r", radius)
            .attr("fill", "black");

        uinodes.append("text")
            .text(function(d, i) {
                var params = "";
                if(d.args.length > 0)
                    return params = d.args.join();
                return d.name;
            })
            .attr("x", function(d, i) {
                return d.x;
            })
            .attr("y", function(d, i) {
                return d.y - 10;
            })
            .attr("font-family", "Helvetica Neue,Helvetica,Arial,sans-serif")
            .attr("fill", "black")
            .attr("font-size", fontSize);

        vis.selectAll(".line")
            .data(links)
            .enter()
            .append("line")
            .attr("x1", function(d) {
                return d.source.x
            })
            .attr("y1", function(d) {
                return d.source.y
            })
            .attr("x2", function(d) {
                return d.target.x
            })
            .attr("y2", function(d) {
                return d.target.y
            })
            .style("stroke", "rgb(6,120,155)");
    },

    drawGraph: function() {
        var flow = $('#flow').val();
        if (flow == undefined)
            return;
        var root = new node();
        root.name = "RESULT";
        root.children = [Mimir.visualization.createTree($.parseJSON(flow))];
        Mimir.visualization.graph(root);
    }

}

Mimir.discovery = {

    drawTree: function(source) {

        var margin = {top: 20, right: 120, bottom: 20, left: 120},
            width = 960 - margin.right - margin.left,
            height = 500 - margin.top - margin.bottom;

        var i = 0;

        var tree = d3.layout.tree().size([height, width]);

        var diagonal = d3.svg.diagonal().projection(function(d) { return [d.y, d.x]; });

        var svg = d3.select("#ontologyViz").append("svg")
            .attr("width", width + margin.right + margin.left)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        // Compute the new tree layout.
        var nodes = tree.nodes(source).reverse(),
            links = tree.links(nodes);

        // Normalize for fixed-depth.
        nodes.forEach(function(d) { d.y = d.depth * 180; });

        // Declare the nodes…
        var node = svg.selectAll("g.node")
            .data(nodes, function(d) { return d.id || (d.id = ++i); });

        // Enter the nodes.
        var nodeEnter = node.enter().append("g")
            .attr("class", "node")
            .attr("transform", function(d) {
                return "translate(" + d.y + "," + d.x + ")"; });

        nodeEnter.append("circle")
            .attr("r", 10)
            .style("fill", "#fff");

        nodeEnter.append("text")
            .attr("x", function(d) {
                return d.children || d._children ? -13 : 13; })
            .attr("dy", ".35em")
            .attr("text-anchor", function(d) {
                return d.children || d._children ? "end" : "start"; })
            .text(function(d) { return d.name; })
            .style("fill-opacity", 1);

        // Declare the links…
        var link = svg.selectAll("path.link")
            .data(links, function(d) { return d.target.id; });

        // Enter the links.
        link.enter().insert("path", "g")
            .attr("class", "link")
            .attr("d", diagonal);

    }
}

