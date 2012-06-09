/*
 * Copyright **?
 *
 * Gnome Documents is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * Gnome Documents is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * withconst Gio = imports.gi.Gio; Gnome Documents; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Author: Meg Ford <megford@gnome.org>
 *
 */

const Gd = imports.gi.Gd;
const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
//const GtkClutter = imports.gi.GtkClutter;
const _ = imports.gettext.gettext;

const Documents = imports.documents;
const Global = imports.global;
//const Manager = imports.manager;
//const Notifications = imports.notifications;
const Query = imports.query;
//const Tweener = imports.util.tweener;
const Utils = imports.utils;

const Lang = imports.lang;
//const Signals = imports.signals;
//FIXME Not sure which import statements I can safely remove **need to test; also review gjs styleguide & pretty-up the code

//const Properties = new Lang.Class({
//    Name: 'Properties',
function PropertiesDialog(toplevel) {
    this._init(toplevel);
}

PropertiesDialog.prototype = {
    _init: function() {
       let selection = Global.selectionController.getSelection();
        selection.forEach(Lang.bind(this,
            function(urn) {
        let doc = Global.documentManager.getItemById(urn);
        
         
        this._nameMetadata = doc.name;
        this._authorMetadata = doc.author;

        this._sourceDetail = doc.sourceName;

        if (this. _sourceDetail == "Local"){
        this._sourcePath = Gio.file_new_for_uri(doc.uri).get_parent();
        this._directoryMetadata = this._sourcePath.get_path();
        }else
          this._directoryMetadata = doc.sourceName;

        this._dateModifiedMetadata = GLib.DateTime.new_from_unix_local(doc.mtime);
        this._dateModifiedMetadata = this._dateModifiedMetadata.format('%c');

        this._dateCreatedMetadata = GLib.DateTime.new_from_unix_local(doc.dateCreated);
        this._dateCreatedMetadata = this._dateCreatedMetadata.format('%c');
        this._documentTypeMetadata = doc.typeDescription;

        this.widget = new Gtk.Dialog({ //transient_for: toplevel,
                                       modal: true,
                                       destroy_with_parent: true,
                                       default_width: 400,
                                       default_height:500 });
        
        this.widget.set_border_width(6);
       
        this.widget.add_button('gtk-ok', Gtk.ResponseType.OK);
        this.widget.set_default_response(Gtk.ResponseType.OK);

        let grid = new Gtk.Grid ({ orientation: Gtk.Orientation.VERTICAL, 
                                   margin: 20, 
                                   row_spacing: 10, 
                                   column_spacing: 30,
                                   valign: Gtk.Align.START});
        let contentArea = this.widget.get_content_area();

        this._message = new Gtk.Label ({ label: _("Properties"), 
                                         margin_bottom: 10, 
                                         halign: Gtk.Align.CENTER, 
                                         hexpand: false });
            
        grid.attach (this._message, 0, 0, 2, 1);
        
        this._title = new Gtk.Label({ label: _("Title: "),
                                      margin_bottom: 10, 
                                      halign: Gtk.Align.START, 
                                      hexpand: false });
        grid.attach (this._title, 0, 1, 2, 1);

       
   
        this._author = new Gtk.Label({ label: _("Author: "),
                                       margin_bottom: 10, 
                                       halign: Gtk.Align.START, 
                                       hexpand: false });
        grid.attach (this._author, 0, 2, 2, 1);
     

        this._source = new Gtk.Label({ label: _("Source: "),
                                       margin_bottom: 10, 
                                       halign: Gtk.Align.START, 
                                       hexpand: false });
        grid.attach (this._source, 0, 3, 2, 1);

        
        this._dateModified = new Gtk.Label({ label: _("Date Modified: "),
                                             margin_bottom: 10, 
                                             halign: Gtk.Align.START, 
                                             hexpand: false });
        grid.attach (this._dateModified, 0, 4, 2, 1);


        this._dateCreated = new Gtk.Label({ label: _("Date Created: "), 
                                            margin_bottom: 10, 
                                            halign: Gtk.Align.START, 
                                            hexpand: false }); 
        grid.attach (this._dateCreated, 0, 5, 2, 1);

        this._docType = new Gtk.Label({ label: _("Type: "),
                                        margin_bottom: 10, 
                                        halign: Gtk.Align.START, 
                                        hexpand: false });
        grid.attach (this._docType, 0, 6, 2, 1);

        this._titleData = new Gtk.Label({ label: this._nameMetadata,
                                          margin_bottom: 10,  
                                          hexpand: false });
        grid.attach (this._titleData, 1, 1, 2, 1);

        this._authorData = new Gtk.Label({ label: this._authorMetadata,
                                           margin_bottom: 10, 
                                           hexpand: false });
        grid.attach (this._authorData, 1, 2, 2, 1);

        this._sourceData = new Gtk.Label({ label: this._directoryMetadata,
                                           margin_bottom: 10, 
                                           hexpand: false });
        grid.attach (this._sourceData, 1, 3, 2, 1);

        this._dateModifiedData = new Gtk.Label({ label: this._dateModifiedMetadata,
                                                 margin_bottom: 10, 
                                                 hexpand: false });
        grid.attach (this._dateModifiedData, 1, 4, 2, 1);

        this._dateCreatedData = new Gtk.Label({ label: this._dateCreatedMetadata,
                                                margin_bottom: 10, 
                                                hexpand: false });
        grid.attach (this._dateCreatedData, 1, 5, 2, 1);

        this._documentTypeData = new Gtk.Label({ label: this._documentTypeMetadata,
                                                margin_bottom: 10, 
                                                hexpand: false });
        grid.attach (this._documentTypeData, 1, 6, 2, 1);

        contentArea.pack_start(grid, true, true, 6);
         }));  
      this.widget.show_all();
    }
};
