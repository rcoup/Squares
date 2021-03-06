///<reference path="d3types.ts" />
import Mouse = module('Mouse');
import Hash = module('Hash');
import Base = module('Base');
import Core = module('Core');
import Tile = module('Tile');
import Grid = module('Grid');
import Geo = module('Geo');

export class Map implements Base.Map
{
    public grid:Grid.Grid;
    public parent:HTMLElement;

    private queue:Queue;
    private selection:ID3Selection;
    private loaded_tiles:Object;
    private template:string;
    
    // functions called for each image tile as it enters/exits the map.
    private tile_queuer:(tile:Tile.Tile, index:number)=>void;
    private tile_dequeuer:(tile:Tile.Tile, index:number)=>void;
    private tile_onloaded:(tile:Tile.Tile, index:number)=>void;

    private projection:Geo.Projection;
    private moved_callback:()=>void;
    
    constructor(parent:HTMLElement, template:string, proj:Geo.Projection, loc:Geo.Location, zoom:number)
    {
        this.selection = d3.select(parent);
        this.loaded_tiles = {};
        this.template = template;
        this.parent = parent;
        
        var size = Mouse.element_size(this.parent),
            coord = proj.locationCoordinate(loc).zoomTo(zoom);

        this.grid = new Grid.Grid(size.x, size.y, coord, 3);
        this.projection = proj;

        this.queue = new Queue(this.loaded_tiles);
        this.tile_queuer = this.getTileQueuer();
        this.tile_dequeuer = this.getTileDequeuer();
        this.tile_onloaded = this.getTileOnloaded();
        
        // Link controls after Grid is set up, so coordinates and such exist.
        Mouse.link_control(this.selection, new Mouse.Control(this, true));
        Hash.link_control(this);
        
        var map = this;
        
        d3.select(window).on('resize.map', function() { map.update_gridsize() });
        
        this.selection.selectAll('img.tile').remove();
        this.redraw(true);
    }
    
    private update_gridsize():void
    {
        var size = Mouse.element_size(this.parent);
        this.grid.resize(size.x, size.y);
        this.redraw(true);
    }
    
    public pointLocation(point:Core.Point):Geo.Location
    {
        var coord = this.grid.pointCoordinate(point ? point : this.grid.center);
        return this.projection.coordinateLocation(coord);
    }
    
    public locationPoint(loc:Geo.Location):Core.Point
    {
        var coord = this.projection.locationCoordinate(loc);
        return this.grid.coordinatePoint(coord);
    }
    
    public setCenterZoom(loc:Geo.Location, zoom:number):void
    {
        this.grid.setCenter(this.projection.locationCoordinate(loc, zoom));
        this.redraw(true);
    }
    
    public onMoved(callback:(map:Base.Map)=>void):void
    {
        var map = this,
            before = this.moved_callback;
        
        this.moved_callback = function()
        {
            if(before)
            {
                before();
            }

            callback(map);
        }
    }
    
    public redraw(moved:Boolean):void
    {
        var tiles = this.grid.visibleTiles(),
            join = this.selection.selectAll('img.tile').data(tiles, tile_key);
        
        join.exit()
            .each(this.tile_dequeuer)
            .remove();

        join.enter()
            .append('img')
            .attr('class', 'tile')
            .attr('id', tile_key)
            .style('z-index', tile_zoom)
            .style('display', 'none')
            .on('load', this.tile_onloaded)
            .each(this.tile_queuer);
        
        if(Tile.transform_property) {
            // Use CSS transforms if available.
            this.selection.selectAll('img.tile')
                .style(Tile.transform_property, tile_xform);

        } else {
            this.selection.selectAll('img.tile')
                .style('left', tile_left)
                .style('top', tile_top)
                .style('width', tile_width)
                .style('height', tile_height);
        }
        
        if(moved && this.moved_callback)
        {
            this.moved_callback();
        }
        
        this.queue.process();
    }
    
   /**
    * Return a function usable in d3...on('load', ...).
    */
    private getTileOnloaded():(tile:Tile.Tile, i:number)=>void
    {
        var map = this;
        
       /**
        * The specified listener is invoked in the same manner as other
        * operator functions, being passed the current datum `tile` and
        * index `i`, with the `this` context as the current DOM element.
        *
        * https://github.com/mbostock/d3/wiki/Selections#wiki-on
        */
        return function(tile:Tile.Tile, i:number)
        {
            d3.select(this).style('display', 'block');
            map.loaded_tiles[this.src] = Date.now();
            map.queue.close(this);
            map.redraw(false);
        }
    }
    
   /**
    * Return a function usable in d3.select().each().
    */
    private getTileQueuer():(tile:Tile.Tile, i:number)=>void
    {
        var map = this;
        
       /**
        * Invokes the specified function for each element in the current
        * selection, passing in the current datum `tile` and index `i`,
        * with the `this` context of the current DOM element.
        *
        * https://github.com/mbostock/d3/wiki/Selections#wiki-each
        */
        return function(tile:Tile.Tile, i:number)
        {
            var src = map.template;
            
            src = src.replace('{z}', '{Z}').replace('{Z}', tile.coord.zoom.toFixed(0));
            src = src.replace('{x}', '{X}').replace('{X}', tile.coord.column.toFixed(0));
            src = src.replace('{y}', '{Y}').replace('{Y}', tile.coord.row.toFixed(0));
            
            map.queue.append(this, src);
        }
    }
    
   /**
    * Return a function usable in d3.select().each().
    */
    private getTileDequeuer():(tile:Tile.Tile, i:number)=>void
    {
        var queue = this.queue;
        
       /**
        * Invokes the specified function for each element in the current
        * selection, passing in the current datum `tile` and index `i`,
        * with the `this` context of the current DOM element.
        *
        * https://github.com/mbostock/d3/wiki/Selections#wiki-each
        */
        return function(tile:Tile.Tile, i:number)
        {
            queue.cancel(this);
        }
    }
}

class Queue
{
    private queue:any[] = [];
    private queue_by_id:Object = {};
    private open_request_count:number = 0;
    private requests_by_id:Object = {};
    
    // Dictionary of loaded tiles on loan from the Map object.
    private loaded_tiles:Object;
    
    constructor(loaded_tiles:Object)
    {
        this.loaded_tiles = loaded_tiles;
    }
    
   /**
    * Add an image and desired source URL to the queue.
    */
    public append(image:HTMLImageElement, src:string):void
    {
        if(src in this.loaded_tiles) {
            // if we've seen it this session the browser cache probably has it.
            image.src = src;
            
        } else {
            var request:Request = new Request(image, src);

            this.queue.push(request);
            this.queue_by_id[request.id] = request;
        }
    }
    
   /**
    * Cancel loading on an image whether it's been processed or not.
    */
    public cancel(image:HTMLImageElement):void
    {
        /*
        // attempt to cancel loading for incomplete tiles
        // and prevent very large/tiny tiles from being scaled
        // (remove these immediately so they don't slow down positioning)
        if (!this.complete || (coord.z - tile.z > 5) || (tile.z - coord.z > 2)) {
            this.src = null;
            d3.select(this).remove();
        }
        */

        this.close(image);
        
        var request:Request = this.queue_by_id[image.id];

        if(request)
        {
            request.deny();
            delete this.queue_by_id[image.id];
        }            
    }

   /**
    * Called when tiles are complete or from this.cancel().
    */
    public close(image:HTMLImageElement)
    {
        var request:Request = this.requests_by_id[image.id];

        if(request)
        {
            request.deny();
            delete this.requests_by_id[image.id];
            this.open_request_count--;
        }            
    }
    
   /**
    * Request up to 8 things from the queue, skipping blank items.
    */
    public process():void
    {
        this.queue.sort(Request.compare);
    
        while(this.open_request_count < 4 && this.queue.length > 0)
        {
            var request:Request = this.queue.shift(),
                loading:Boolean = request.load();

            if(loading)
            {
                this.requests_by_id[request.id] = request; 
                this.open_request_count++;
            }

            delete this.queue_by_id[request.id];                        
        }
    }
}

class Request
{
    public id:string;
    public sort:number;
    
    private image:HTMLImageElement;
    private src:string;

    constructor(image:HTMLImageElement, src:string)
    {
        this.id = image.id;
        this.sort = parseInt(d3.select(image).style('z-index'));
        this.image = image;
        this.src = src;
    }
    
   /*
    * Prevent future loads from actually happening.
    */
    public deny():void
    {
        this.image = null;
    }
    
   /*
    * Attempt to load the image.
    *
    * Return true if it's not been previously-denied.
    */
    public load():Boolean
    {
        if(this.image && this.image.parentNode)
        {
            this.image.src = this.src;
            return true;
        }
        
        return false;
    }
    
   /**
    * Function to help sort requests by .sort value, highest-to-lowest.
    */
    public static compare(a:Request, b:Request):number
    {
        return b.sort - a.sort;
    }
}

//
// Pile of convenience functions for use in D3 callbacks.
//
function tile_key   (tile:Tile.Tile):string { return tile.toKey()     }
function tile_left  (tile:Tile.Tile):string { return tile.left()      }
function tile_top   (tile:Tile.Tile):string { return tile.top()       }
function tile_width (tile:Tile.Tile):string { return tile.width()     }
function tile_height(tile:Tile.Tile):string { return tile.height()    }
function tile_xform (tile:Tile.Tile):string { return tile.transform() }
function tile_zoom  (tile:Tile.Tile):number { return tile.coord.zoom  }
