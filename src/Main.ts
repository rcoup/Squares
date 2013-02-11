import Image = module('Image');
import Div = module('Div');
import Geo = module('Geo');

var sorry_docbody_safari5:string = 'Sorry, for the moment I can’t figure out how to make the mousewheel work in Safari 5.0 when the parent element is the document body. Try making your parent element a DIV?';

function makeImgMap(parent:HTMLElement, template:string, lat:number, lon:number, zoom:number):Image.Map
{
    if(parent == document.body)
    {
        throw Error(sorry_docbody_safari5);
    }

    return new Image.Map(parent, template, new Geo.Mercator(), new Geo.Location(lat, lon), zoom);
}

function makeDivMap(parent:HTMLElement, lat:number, lon:number, zoom:number):Div.Map
{
    if(parent == document.body)
    {
        throw Error(sorry_docbody_safari5);
    }

    return new Div.Map(parent, new Geo.Mercator(), new Geo.Location(lat, lon), zoom);
}

window['squares'] = {
    makeImgMap: makeImgMap,
    makeDivMap: makeDivMap,
    ImageMap: Image.Map,
    DivMap: Div.Map,
    Geo: {
        Mercator: Geo.Mercator
        }
    };

if(window['sq'] == undefined)
{
    window['sq'] = window['squares'];
}