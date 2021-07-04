/// <reference path="jquery-vsdoc.js" />
/// <reference path="//ajax.googleapis.com/ajax/libs/jqueryui/1.10.4/jquery-ui.min.js" />
/// <reference path="maps.googleapis.com/maps/api/js?v=3&sensor=false" />
/// <reference path="google-maps-3-vs-1-0.js" />
mdot["maps"]["plugins"]["trafficcast"] = mdot["maps"]["plugins"]["trafficcast"] || {};
mdot["maps"]["plugins"]["trafficcast"]["TCLine"] = mdot["maps"]["plugins"]["trafficcast"]["TCLine"] || function (options)
{
    "use strict";
    this.speed = options["speed"];
    this.origin = options["origin"];
    this.travelTime = options["travelTime"];
    this.status = options["status"];
    this.direction = options["direction"];
    this.destination = options["destination"];
    this.route = options["route"];
    this.lastUpdated = options["lastUpdated"];
    this.number = options["number"]; //mainly for debugging currently
    this.color = this.getLineColor();
    
    this.getInfoWindowContent = function ()
    {
        return "<table><tr><td style='white-space:nowrap;'>Speed:</td><td style='white-space:nowrap;'><div style='background-color:"
            + this.color
            + ";width:20px; height:10px;'></div></td></tr><tr><td style='white-space:nowrap;'>Travel Time:</td><td style='white-space:nowrap;'>"
            + this.travelTime //+ "&nbsp;PairID=" + this.number + ";&nbsp;Index=" + this.index
            + "</td></tr><tr><td style='white-space:nowrap;'>Last&nbsp;Updated:</td><td style='white-space:nowrap;'>"
            + options["lastUpdated"]
            + "</td></tr>
			+<tr><td>direction:</td><td>this.direction</td></tr>
			+<tr><td>origin:</td><td>this.origin</td></tr>
			+<tr><td>destination:</td><td>this.destination</td></tr>
			</table>"
          //+ "<tr><td colspan='2' style='white-space:nowrap;text-align: center;font-size: x-small;font-style: italic;'>Last updated: " + options["lastUpdated"] + "</td></tr></table>";
    };

    //Doesn't matter what strokeColor options may have initially,
    //since it's strictly a function of this.speed
    options["strokeColor"] = this.color;

    options["zIndex"] = this.getLineZIndex();
    google.maps.Polyline.call(this, options);
};




mdot["maps"]["plugins"]["trafficcast"]["TCOverlay"] = mdot["maps"]["plugins"]["trafficcast"]["TCOverlay"] || function (map, options)
{
    "use strict";
    this.setMap(map);
    this.prj = this.getProjection();
    this["TCLines"] = {};
    this.isUpdating = false;

    this.restartUpdate = false;

    var
        infoWindow = map.infoWindow,
                that = this, //used in internal methods
                $tcCheckbox = $(options["checkBox"])
                    .change(function ()
                    {
                        if ($(this).prop("checked"))
                        {
                            that.show();
                        } else
                        {
                            that.hide();
                            if (infoWindow["owner"] == that)
                            {
                                infoWindow["owner"] = null;
                            }
                        }
                    });

    this.isVisible = $tcCheckbox.prop("checked") ? true : false;

    this.offsetLine = function (line)
    {
        if (that.restartUpdate == true)
        {
            return false;
        }
        var offsetPoints = new Array();
        var path = line.route;

        //Point 0 seems to be just an anchor point for the route as a whole, and not
        //intended for use as an actual point on the route...
        var latLng;
        for (var i = 2; i < path.length; i++)
        {
            var latLng1 = path[i - 1];
            var latLng2 = path[i];

            // Skip points that are the same
            if (latLng1.lat() == latLng2.lat() && latLng1.lng() == latLng2.lng())
            {
                if (i == path.length - 1)
                {
                    //last 2 points were the same, nothing left to do
                    continue;
                }
                //since point i was same as point i-1, jump to point i+1 (and assume its different)
                i++;
                latLng2 = path[i];
            }
            latLng = that.offsetPoint(latLng1, latLng2, false);
            offsetPoints.push(latLng);
        }

        // Add the last point (note we do the same thing except the points are 
        // switched since the vector is in the opposite direction).
        latLng1 = path[path.length - 1];
        latLng2 = path[path.length - 2];
        latLng = that.offsetPoint(latLng1, latLng2, true);
        offsetPoints.push(latLng);
        line.setPath(offsetPoints);

        //Even though we always (on every zoom) do a repositioning of the line, we don't always display the line
        if (that.isVisible == true)
        {
            line.setMap(map);
        }

        return line;
    };


    // TCOverlay implements the OverlayView interface
    // Methods that need to be implemented in GMaps 3 = onAdd(), draw(), and onRemove()
    this.draw = function () { };


    this["onAdd"] = function ()
    {
        var tcPairs = options["data"]["tcJSON"]["TRAVELDATA"]["PAIRDATA"];
        var mapStartValue = $tcCheckbox.prop("checked") ? map : null;
        var badPairCount = 0;
        this.TCLines.length = tcPairs.length;
        var opacity = 1;
        var weight = 4; //5;
        var lines = this.TCLines;
        var lastUpdated = options["data"]["tcJSON"]["TRAVELDATA"]["LastUpdated"];
        
        //to get intellisense in dev, uncomment the following sample cameras assignment
        $.each(tcPairs, function (i, pair)
        {

            if (typeof pair.Routes === "undefined")
            {
                badPairCount++;
                return true; //continue the $.each loop
            } else
            {
                var path = pair.Routes.Route;

                var googPoints = [];
                if (path instanceof google.maps.MVCArray) // Indicates a google MVCArray
                    googPoints = path;
                else
                {

                    var start = 0;
                    var end = path.length - 1;

                    if (path.length <= 2)
                    {
                        badPairCount++;
                        return true; //continue the $.each loop
                    }

                    for (var j = start; j < end; j++)
                    {
                        if (path[j] instanceof google.maps.LatLng)
                            googPoints.push(path[j]);
                        else
                            googPoints.push(new google.maps.LatLng(path[j].lat, path[j].lon));

                    }
                }
                path = googPoints;

                // Based on the way the parallel line class works, the offset will be positive
                // or negative based on the direction of the line.  Thus, we can have a fixed offset
                // and we don't need to calculate it based on heading

                var line = new mdot["maps"]["plugins"]["trafficcast"]["TCLine"]({
                    map: map,
                    path: path,
                    strokeWeight: weight,
                    strokeOpacity: opacity,
                    speed: pair.Speed,
                    origin: pair.Origin,
                    destination: pair.Destination,
                    direction: pair.Direction,
                    travelTime: pair.TravelTime,
                    status: pair.Status,
                    route: path,
                    pairID: pair.PairID,
                    index: i,
                    lastUpdated: lastUpdated
                });

                // Show/hide the window if the user clicks the line
                google.maps.event.addListener(line, 'click', function (event)
                {
                    infoWindow.close();
                    infoWindow.setContent(line.getInfoWindowContent());

                    infoWindow.setPosition(event.latLng);
                    infoWindow.open(map);
                    infoWindow["owner"] = that;
                });
                google.maps.event.addListener(line, 'mouseover', function (event) { that.PHighLight(line); });
                google.maps.event.addListener(line, 'mouseout', function (event) { that.RemovePHighLight(line); });

                lines[i - badPairCount] = that.offsetLine(line);
            }
        });
        lines.length = tcPairs.length - badPairCount;

        //Remove references to large JSON objects (so they can be collected as garbage)
        options["tcJSON"] = null;
    };

    this.redraw = function (force)
    {
        return; //do nothing
    };

    /**
    * Returns the first point adjusted to be offset tangentially by the angle
    * between point 1 and point 2
    * @param google.maps.LatLng latLng1 origin point (point to adjust)
    * @param google.maps.LatLng latLng2 dest point
    * @param boolean negative if true, negate the offset
    * @return google.maps.LatLng adjusted point
    */
    this.offsetPoint = function (latLng1, latLng2, negative)
    {
        var prj = (typeof this.prj == 'undefined') ? (this.prj = this.getProjection()) : this.prj;
        // How many pixels to move the points given the width of the line 
        //var shiftPx = this.offset + (this.strokeWeight / 2);
        var shiftPx = 4;
        // Convert LatLngs to Pixels

        var p1 = prj.fromLatLngToContainerPixel(latLng1);
        var p2 = prj.fromLatLngToContainerPixel(latLng2);

        // Get the angle between the two points and the positive X-axis 
        var v12X = p2.x - p1.x;
        var v12Y = p2.y - p1.y;
        var lineAngle = Math.atan2(v12Y, v12X);

        // Get the angle between the offset line and the X-axis
        var offsetAngle = (Math.PI / 2) - lineAngle;
        // Offset for point 1 by the diagonal
        var dx = Math.round(shiftPx * Math.cos(offsetAngle));
        var dy = Math.round(shiftPx * Math.sin(offsetAngle));

        if (negative)
        {
            dx = dx * -1;
            dy = dy * -1;
        }

        var p1Offset = new google.maps.Point(p1.x - dx, p1.y + dy);

        // Convert back to a LatLng to draw the line
        return prj.fromContainerPixelToLatLng(p1Offset);
    };


    this.onRemove = function () { };

    this.hide = function ()
    {
        for (var i = 0; i < this.TCLines.length; i++)
            this.TCLines[i].setMap(null);

        this.isVisible = false;
    };


    this.show = function ()
    {
        for (var i = 0; i < this.TCLines.length; i++)
            this.TCLines[i].setMap(map);

        this.isVisible = true;
    };

    this.PHighLight = function (line) { line.setOptions({ zIndex: 300, strokeOpacity: 1, strokeWeight: 8 }); };

    this.RemovePHighLight = function (line) {
        /// <summary>Removes the highlight from a highlighted TCLine</summary>
        /// <param name="line" type="TCLine">A highlighted TCLine which we want to un-highlight</param>
        line.setOptions({ zIndex: line.getLineZIndex(), strokeOpacity: 1, strokeWeight: 4 });
    };

    function async(fn)
    {
        setTimeout(fn, 20);
    }

    function zoomUpdate()
    {
        //tell the world that we've begun to update the lines
        that.isUpdating = true;

        //set the overview visibility to whatever the checkbox indicates
        if ($tcCheckbox.prop("checked"))
        {
            that.isVisible = true;
        } else
        {
            that.isVisible = false;
        }

        that.prj = that.getProjection();
        yieldingEach(that.TCLines, that.offsetLine, 5, function ()
        {
            that.restartUpdate = false;
            that.timeout = null;
            that.isUpdating = false;
        });
    }

    /// <signature>
    /// <summary>A for-each replacement which pauses periodically to allow other code to execute.</summary>
    /// <param name="iterFn" type="mdot.TCLine[]">An array of TCLine objects</param>
    /// <param name="items" type="mdot.TCLine[]">An array of TCLine objects</param>
    /// <param name="batchDuration" type="int">The number of milliseconds to allow for each batch of iterations</param>
    /// </signature>
    /// <signature>
    /// <summary>Function summary 2.</summary>
    /// <param name="a" type="String">A string.</param>
    /// <returns type="Number" />
    /// </signature>
    function yieldingEach(items, iterFn, batchDuration, callback)
    {
        var i = 0, len = items.length;
        async(function go()
        {
            var result;

            // Process the items in batch for batchDuration ms, or while the result of
            // calling `iterFn` on the current item is not false
            for (var start = +new Date;
                i < len && result !== false && ((+new Date) - start < batchDuration) ;
                i++)
            {
                result = iterFn.call(items[i], items[i], i);
            }

            // When the 5ms is up, let the UI thread update by defering the
            // rest of the iteration with `async`.
            if (that.restartUpdate == false)
            {
                if (i < len && result !== false)
                {
                    async(go);
                } else if (callback != null)
                {
                    callback();
                }
            } else
            {
                that.restartUpdate = false;
                that.prj = that.getProjection();
                i = 0;
                async(go);
            }
        });
    }

    google.maps.event.addListener(map, 'zoom_changed', function ()
    {
        if (that.isUpdating == true)
        {
            //hide everything before rendering (removes lines from the dom and makes the zoom go faster)
            that.hide();

            //set the overview visibility to whatever the checkbox indicates
            if ($tcCheckbox.prop("checked"))
            {
                that.isVisible = true;
            } else
            {
                that.isVisible = false;
            }

            //notify the world that something changed and we need to restart the update from the beginning
            that.restartUpdate = true;
        }
        else
        {
            //first check if there are any functions waiting to be called, and cancel them
            if (that.timeout != null)
            {
                clearTimeout(that.timeout);
                that.timeout = setTimeout(zoomUpdate, 100);
            } else
            {
                //Do the hide here before the zoom actually starts. It's important that we don't have any
                //lines in the dom when the map begins to zoom
                that.hide();
                that.timeout = setTimeout(zoomUpdate, 100);
            }
        }
    });
};


mdot["maps"]["plugins"]["trafficcast"]["applyToMap"] = function (map, options)
{
    var lineProto = mdot["maps"]["plugins"]["trafficcast"]["TCLine"].prototype = new google.maps.Polyline();
    //CJM - These are assumed to already exist in the constructor so they need to be part of the prototype
    lineProto.getLineColor = function ()
    {
        var speed = this.speed;
        if (speed == "")
        {
            return "#AAA2A2";
        }
        speed = parseFloat(speed);

        if (speed >= 0 && speed < 25)
        {
            return "#C40B24";
        } else if (speed >= 25 && speed < 50)
        {
            return "#F2F224";
        } else if (speed >= 50)
        {
            return "#338426";
        } else
        {
            return "#AAA2A2";
        }
    };

    
    lineProto.getLineZIndex = function ()
    {
        /// <summary>Gets the z-index for a TCLine</summary>
        /// <returns type="Number" />
        var bottomIndex = 100,
            speed = this.speed;

        if (speed == "")
        {
            return bottomIndex;
        }

        speed = parseFloat(speed);

        if (speed >= 0 && speed < 25)
        {
            return bottomIndex + 30;
        }
        else if (speed >= 25 && speed < 50)
        {
            return bottomIndex + 20;
        }
        else if (speed >= 50)
        {
            //Highest zIndex
            return bottomIndex + 10;
        }
        else
        {
            return bottomIndex;
        }
    };
    //CJM - END Static methods for TCLine//////////////////////////////////////////////////////////////////////////

    mdot["maps"]["plugins"]["trafficcast"]["TCOverlay"].prototype = new google.maps.OverlayView();
    map["tcLines"] = new mdot["maps"]["plugins"]["trafficcast"]["TCOverlay"](map, options);
}
