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
const TrackerUtils = imports.trackerUtils;
const Utils = imports.utils;

const Lang = imports.lang;
const Signals = imports.signals;

const PropertiesDialog = new Lang.Class({
    Name: 'PropertiesDialog',
 	
    _init: function(urn) {
	this._urn = urn; 
        let doc = Global.documentManager.getItemById(this._urn);

	this._docId = doc.id;
        this._nameMetadata = doc.name;
        this._authorMetadata = doc.author;
	this._sourceDetail = doc.sourceName;

        if (doc instanceof Documents.LocalDocument ){
            this._sourcePath = Gio.file_new_for_uri(doc.uri).get_parent();
            this._directoryMetadata = this._sourcePath.get_path();
        } else {
            this._directoryMetadata = doc.sourceName;
        }

        this._dateModifiedMetadata = GLib.DateTime.new_from_unix_local(doc.mtime);
        this._dateModifiedMetadata = this._dateModifiedMetadata.format('%c');

        if (doc.dateCreated != -1) {
           this._dateCreatedMetadata = GLib.DateTime.new_from_unix_local(doc.dateCreated);
           this._dateCreatedMetadata = this._dateCreatedMetadata.format('%c');
        } else {
           this._dateCreatedMetadata = null;
        }
 
       	this._documentTypeMetadata = doc.typeDescription;

        let toplevel = Global.application.application.get_windows()[0];
        this.widget = new Gtk.Dialog ({ resizable: false, 
                	                transient_for: toplevel,
                        	        modal: true,
                                	destroy_with_parent: true,
                                        default_width: 400, 
                                       	hexpand: true });
       
        let grid = new Gtk.Grid ({ orientation: Gtk.Orientation.VERTICAL, 
        	                   column_homogeneous: true,
                	           halign: Gtk.Align.CENTER,
                        	   row_spacing: 12,
                                   column_spacing: 24,
                                   margin_left: 24,
                                   margin_right: 24,
				   margin_bottom: 12 });

      	let contentArea = this.widget.get_content_area();

	this._done = new Gtk.Button({label: "Done"}); //Label for Done button in Properties dialog
        this.widget.add_button('Done', Gtk.ResponseType.OK); 

	this._message = new Gtk.Label ({ label: _("<span size='large'><b>"+"Properties"+"</b></span>"), //Label for Properties dialog
                	                 halign: Gtk.Align.CENTER,
                        	         use_markup: true, 
                             	         hexpand: false });
        grid.attach (this._message, 1, 0, 1, 1);
        
        this._title = new Gtk.Label({ label: _("Title: "), //Label for Title item in Properties dialog
       	                              halign: Gtk.Align.END });
        this._title.get_style_context ().add_class('dim-label')
	grid.add(this._title);

        this._author = new Gtk.Label({ label: _("Author: "), //Label for Author item in Properties dialog
       	                               halign: Gtk.Align.END });
        this._author.get_style_context ().add_class('dim-label')
        grid.add(this._author);
     
	this._source = new Gtk.Label({ label: _("Source: "), //Label for Source item in Properties dialog
                                       halign: Gtk.Align.END });
        this._source.get_style_context ().add_class('dim-label')
        grid.add (this._source);

        this._dateModified = new Gtk.Label({ label: _("Date Modified: "), //Label for Date Modified item in Properties dialog
                                             halign: Gtk.Align.END });
        this._dateModified.get_style_context ().add_class('dim-label')
        grid.add (this._dateModified);

        if (this._dateCreatedMetadata) {
            this._dateCreated = new Gtk.Label({ label: _("Date Created: "), //Label for Date Created item in Properties dialog
                                                halign: Gtk.Align.END });
            this._dateCreated.get_style_context ().add_class('dim-label') 
            grid.add (this._dateCreated);
        }

        this._docType = new Gtk.Label({ label: _("Type: "), //Label for document Type in Properties dialog
 				       halign: Gtk.Align.END });
        this._docType.get_style_context ().add_class('dim-label')
        grid.add (this._docType);

        if (doc instanceof Documents.LocalDocument ) {
	    this._titleData = new Gtk.Entry({ text: this._nameMetadata,
	       				      editable: true,
					      hexpand: true,
					      halign: Gtk.Align.START });
            grid.attach_next_to (this._titleData, this._title, 1, 2, 1);
	    this._titleData.connect("changed", Lang.bind (this, this._setEditedName, this.docId));
        } else {
	    this._titleData = new Gtk.Label({ label: this._nameMetadata,
	         			      halign: Gtk.Align.START });
	    grid.attach_next_to (this._titleData, this._title, 1, 2, 1);
	}


	this._authorData = new Gtk.Label({ label: this._authorMetadata,
					   halign: Gtk.Align.START });
	grid.attach_next_to (this._authorData, this._author, 1, 2, 1);

	this._sourceData = new Gtk.Label({ label: this._directoryMetadata,
					   halign: Gtk.Align.START });
	grid.attach_next_to (this._sourceData, this._source, 1, 2, 1);

	this._dateModifiedData = new Gtk.Label({ label: this._dateModifiedMetadata,
						 halign: Gtk.Align.START });
	grid.attach_next_to (this._dateModifiedData, this._dateModified, 1, 2, 1);

	if (this._dateCreatedMetadata) {
            this._dateCreatedData = new Gtk.Label({ label: this._dateCreatedMetadata,
						    halign: Gtk.Align.START });
	    grid.attach_next_to (this._dateCreatedData, this._dateCreated, 1, 2, 1);
	}

	this._documentTypeData = new Gtk.Label({ label: this._documentTypeMetadata,
	       					 halign: Gtk.Align.START });
	grid.attach_next_to (this._documentTypeData, this._docType, 1, 2, 1);

	contentArea.pack_start(grid, true, true, 2);
	this.widget.show_all();
    },

    _setEditedName: function(_newTitle, docId) {
	this._newTitle = this._titleData.get_text();
	TrackerUtils.setEditedName(this._newTitle, docId, null); 
    }
});

