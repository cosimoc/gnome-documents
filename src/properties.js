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
 * with Gnome Documents; if not, write to the Free Software Foundation,
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
const GtkClutter = imports.gi.GtkClutter;
const _ = imports.gettext.gettext;

const Documents = imports.documents;
const Global = imports.global;
const Manager = imports.manager;
const Notifications = imports.notifications;
const Query = imports.query;
const Selections = imports.selections;
const Tweener = imports.util.tweener;
const Utils = imports.utils;

const Lang = imports.lang;
const Signals = imports.signals;
//FIXME Not sure which import statements I can safely remove **need to test; also review gjs styleguide & pretty-up the code

const PropertiesDialog = new Lang.Class({
    Name: 'PropertiesDialog',
 
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

        let toplevel = Global.application.application.get_windows()[0];
        this.widget = new Gtk.Dialog ({ resizable: false, 
                                        transient_for: toplevel,
                                        modal: true,
                                        destroy_with_parent: true,
                                        default_width: 400, 
                                        hexpand: true });
       
        let grid = new Gtk.Grid ({ orientation: Gtk.Orientation.HORIZONTAL, 
                                   column_homogeneous: true,
                                   halign: Gtk.Align.CENTER,
                                   row_spacing: 12,
                                   column_spacing: 24,
                                   margin_left: 24,
                                   margin_right: 24,
				   margin_bottom: 12 });

        let contentArea = this.widget.get_content_area();

        this._add = new Gtk.Button({label: "Done"}); //label for Done button
        this.widget.add_button('Done', Gtk.ResponseType.OK);
        this._add.get_style_context ().add_class ('raised');


        this._message = new Gtk.Label ({ label: _("<b>Properties</b>"), //label for Properties Dialog
                                         halign: Gtk.Align.CENTER,
                                         use_markup: true, 
                                         hexpand: false });
        grid.attach (this._message, 1, 0, 1, 1);
        
        this._title = new Gtk.Label({ label: _("Title: "), //label for Title item in properties dialog
                                      halign: Gtk.Align.END });
        grid.attach (this._title, 0, 1, 1, 1);

       
        this._author = new Gtk.Label({ label: _("Author: "), //label for Author item in properties dialog
                                       halign: Gtk.Align.END });
        grid.attach (this._author, 0, 2, 1, 1);
     

        this._source = new Gtk.Label({ label: _("Source: "), //label for directory address or remote location
                                       halign: Gtk.Align.END });
        grid.attach (this._source, 0, 3, 1, 1);

        
        this._dateModified = new Gtk.Label({ label: _("Date Modified: "), //Label for Date last modified
                                             halign: Gtk.Align.END });
        grid.attach (this._dateModified, 0, 4, 1, 1);


        this._dateCreated = new Gtk.Label({ label: _("Date Created: "), //label for Date Created
                                            halign: Gtk.Align.END }); 
        grid.attach (this._dateCreated, 0, 5, 1, 1);


        this._docType = new Gtk.Label({ label: _("Type: "), //label for Type
                                        halign: Gtk.Align.END });
        grid.attach (this._docType, 0, 6, 1, 1);


        this._titleData = new Gtk.Label({ label: this._nameMetadata,
                                          halign: Gtk.Align.START });
        grid.attach_next_to (this._titleData, this._title, 1, 2, 1);


        this._authorData = new Gtk.Label({ label: this._authorMetadata,
                                           halign: Gtk.Align.START });
        grid.attach_next_to (this._authorData, this._author, 1, 2, 1);


        this._sourceData = new Gtk.Label({ label: this._directoryMetadata,
                                           halign: Gtk.Align.START });
        grid.attach_next_to (this._sourceData, this._source, 1, 2, 1);


        this._dateModifiedData = new Gtk.Label({ label: this._dateModifiedMetadata,
                                                 halign: Gtk.Align.START });
        grid.attach_next_to (this._dateModifiedData, this._dateModified, 1, 2, 1);


        this._dateCreatedData = new Gtk.Label({ label: this._dateCreatedMetadata,
                                                halign: Gtk.Align.START });
        grid.attach_next_to (this._dateCreatedData, this._dateCreated, 1, 2, 1);

        this._documentTypeData = new Gtk.Label({ label: this._documentTypeMetadata,
                                                 halign: Gtk.Align.START });
        grid.attach_next_to (this._documentTypeData, this._docType, 1, 2, 1);


        contentArea.pack_start(grid, true, true, 2);
         }));  
        this.widget.show_all();
    }
});
