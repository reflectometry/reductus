// requires(webreduce.server_api)
webreduce = window.webreduce || {};
webreduce.instruments = webreduce.instruments || {};
webreduce.instruments['ncnr.refl'] = webreduce.instruments['ncnr.refl'] || {};

// define the loader and categorizers for ncnr.refl instrument
(function(instrument) {
  function load_refl(datasource, path, mtime, db){
    var template = {
      "name": "loader_template",
      "description": "ReflData remote loader",
      "modules": [
        {"module": "ncnr.refl.ncnr_load.cached", "version": "0.1", "config": {}}
      ],
      "wires": [],
      "instrument": "ncnr.magik",
      "version": "0.0"
    }
    var config = {"0": {"filelist": [{"path": path, "source": datasource, "mtime": mtime}]}},
        module_id = 0,
        terminal_id = "output";
    return webreduce.server_api.calc_terminal(template, config, module_id, terminal_id).then(function(result) {
      result.values.forEach(function(v) {v.mtime = mtime});
      if (db) { db[path] = result; }
      return result.values
    })
  }
  
  function make_range_icon(global_min_x, global_max_x, min_x, max_x) {
    var icon_width = 75;
    var rel_width = Math.abs((max_x - min_x) / (global_max_x - global_min_x));
    var width = icon_width * rel_width;
    var rel_x = Math.abs((min_x - global_min_x) / (global_max_x - global_min_x));
    var x = icon_width * rel_x;
    var output = "<svg class=\"range\" width=\"" + (icon_width + 2) + "\" height=\"12\">";
    output += "<rect width=\"" + width + "\" height=\"10\" x=\"" + x + "\" style=\"fill:IndianRed;stroke:none\"/>"
    output += "<rect width=\"" + icon_width + "\" height=\"10\" style=\"fill:none;stroke:black;stroke-width:1\"/>"
    output += "</svg>"
    return output
  }
  
  var primary_axis = {
    "specular": "Qz_target",
    "background+": "Qz_target",
    "background-": "Qz_target",
    "slit": "Qz_target",
    "intensity": "Qz_target", // what slit scans are called in refldata
    "rock qx": "Qx_target", // curve with fixed Qz
    "rock sample": "sample/angle_x", // Rocking curve with fixed detector angle
    "rock detector": "detector/angle_x" //Rocking curve with fixed sample angle
  }
  
  var get_refl_item = function(obj, path) {
    var result = obj,
        keylist = path.split("/");
    while (keylist.length > 0) {
      result = result[keylist.splice(0,1)];
    }
    return result;
  }
  
  function plot_refl(refl_objs) {
    // entry_ids is list of {path: path, filename: filename, entryname: entryname} ids
    var series = new Array();
    var datas = [], xcol;
    var ycol = "v", ylabel = "y-axis", dycol = "dv", yscale;
    var xcol = "x", xlabel = "x-axis", dxcol = "dx", xscale;
    refl_objs.forEach(function(entry) {
      var intent = entry['intent'];
      var ydata = get_refl_item(entry, ycol);
      var dydata = get_refl_item(entry, dycol);
      var xdata = get_refl_item(entry, xcol);
      ylabel = get_refl_item(entry, "vlabel");
      ylabel += "(" + get_refl_item(entry, "vunits") + ")";
      yscale = get_refl_item(entry, "vscale");
      xlabel = get_refl_item(entry, "xlabel");
      xlabel += "(" + get_refl_item(entry, "xunits") + ")";
      xscale = get_refl_item(entry, "xscale");
      var xydata = [], x, y, dy, ynorm;
      for (var i=0; i<xdata.length || i<ydata.length; i++) {
        x = (i<xdata.length) ? xdata[i] : x; // use last value
        y = (i<ydata.length) ? ydata[i] : y; // use last value
        dy = (i<dydata.length) ? dydata[i] : dy; // use last value
        xydata[i] = [x,y,{yupper: y+dy, ylower:y-dy,xupper:x,xlower:x}];
      }
      datas.push(xydata);
      series.push({label: entry.name + ":" + entry.entry});

    });
    var plottable = {
      type: "1d",
      options: {
        series: series,
        axes: {xaxis: {label: xlabel}, yaxis: {label: ylabel}},
        ytransform: yscale,
        xtransform: xscale
      },
      data: datas
    }

    return plottable
  } 
  
  instrument.plot = function(result) {
		var plottable;
		if (result == null) {
      return
    }
    else if (result.datatype == 'ncnr.refl.refldata') {
      plottable = plot_refl(result.values);
    }
    else if (result.datatype == 'ncnr.refl.footprint.params') {
      plottable = {"type": "params", "params": result.values}
    }
    else if (result.datatype == 'ncnr.refl.poldata') {
      plottable = {"type": "params", "params": result.values}
    }
    return plottable;
  };
  instrument.load_file = load_refl; 
  instrument.categorizers = [
    function(info) { return info.sample.name },
    function(info) { return info.intent || "unknown" },
    function(info) { return info.name },
    function(info) { return info.polarization || "unpolarized" }
  ];
  
  function add_range_indicators(target) {
    var propagate_up_levels = 2; // levels to push up xmin and xmax.
    var jstree = target.jstree(true);
    var source_id = target.parent().attr("id");
    var path = webreduce.getCurrentPath(target.parent());
    var file_objs = webreduce.editor._file_objs[path];
    var leaf, entry;
    // first set min and max for entries:
    for (fn in jstree._model.data) {
      leaf = jstree._model.data[fn];
      if (leaf.li_attr && 'filename' in leaf.li_attr && 'entryname' in leaf.li_attr) {
        entry = file_objs[leaf.li_attr.filename].values.filter(function(f) {return f.entry == leaf.li_attr.entryname});
        if (entry && entry[0]) {
          var e = entry[0];
          var xaxis = 'x'; // primary_axis[e.intent || 'specular'];
          if (!(get_refl_item(entry[0], xaxis))) { console.log(entry[0]); throw "error: no such axis " + xaxis + " in entry for intent " + e.intent }
          var extent = d3.extent(get_refl_item(entry[0], xaxis));
          leaf.li_attr.xmin = extent[0];
          leaf.li_attr.xmax = extent[1];
          var parent = leaf;
          for (var i=0; i<propagate_up_levels; i++) {
            var parent_id = parent.parent;
            parent = jstree._model.data[parent_id];
            if (parent.li_attr.xmin != null) {
              parent.li_attr.xmin = Math.min(extent[0], parent.li_attr.xmin);
            }
            else {
              parent.li_attr.xmin = extent[0];
            }
            if (parent.li_attr.xmax != null) {
              parent.li_attr.xmax = Math.max(extent[1], parent.li_attr.xmax);
            }
            else {
              parent.li_attr.xmax = extent[1];
            }
          }
        }
      }
    }
    for (fn in jstree._model.data) {
      leaf = jstree._model.data[fn];
      if (leaf.parent == null) {continue}
      var l = leaf.li_attr;
      var p = jstree._model.data[leaf.parent].li_attr;
      if (l.xmin != null && l.xmax != null && p.xmin != null && p.xmax != null) {
        var range_icon = make_range_icon(parseFloat(p.xmin), parseFloat(p.xmax), parseFloat(l.xmin), parseFloat(l.xmax));
        leaf.text += range_icon;
      }
    }
  }
  
  function add_sample_description(target) {
    var jstree = target.jstree(true);
    var source_id = target.parent().attr("id");
    var path = webreduce.getCurrentPath(target.parent());
    var file_objs = webreduce.editor._file_objs[path];
    var leaf, entry;
    for (fn in jstree._model.data) {
      leaf = jstree._model.data[fn];
      if (leaf.li_attr && 'filename' in leaf.li_attr && 'entryname' in leaf.li_attr) {
        entry = file_objs[leaf.li_attr.filename].values.filter(function(f) {return f.entry == leaf.li_attr.entryname});
        if (entry && entry[0]) {
          var e = entry[0];
          console.log(e.sample);
          if ('sample' in e && 'description' in e.sample) {
            leaf.li_attr.title = e.sample.description;
            var parent_id = leaf.parent;
            parent = jstree._model.data[parent_id];
            parent.li_attr.title = e.sample.description;
          }
        }
      }
    }
  }
  
  function add_viewer_link(target) {
    var jstree = target.jstree(true);
    var source_id = target.parent().attr("id");
    var path = webreduce.getCurrentPath(target.parent());
    var file_objs = webreduce.editor._file_objs[path];
    var leaf, first_child, entry;
    for (fn in jstree._model.data) {
      leaf = jstree._model.data[fn];
      if (leaf.children.length > 0) {
        first_child = jstree._model.data[leaf.children[0]];
        if (first_child.li_attr && 'filename' in first_child.li_attr && 'entryname' in first_child.li_attr) {
          var fullpath = first_child.li_attr.filename;
          var pathsegments = fullpath.split("/");
          var pathlist = pathsegments.slice(0, pathsegments.length-1).join("+");
          var filename = pathsegments.slice(-1);
          var link = "<a href=\"http://ncnr.nist.gov/ipeek/nexus-zip-viewer.html";
          link += "?pathlist=" + pathlist;
          link += "&filename=" + filename;
          link += "\" style=\"text-decoration:none;\">&#9432;</a>";
          leaf.text += link;
        }
      }
    }
  }
  
  instrument.decorators = [add_range_indicators, add_sample_description, add_viewer_link];
    
})(webreduce.instruments['ncnr.refl']);

