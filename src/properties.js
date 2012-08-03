/*
 * Copyright (c) 2012 Meg Ford
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
const Mainloop = imports.mainloop;
const Manager = imports.manager;
const Notifications = imports.notifications;
const Query = imports.query;
const Selections = imports.selections;
const TrackerUtils = imports.trackerUtils;
const Utils = imports.utils;

const Lang = imports.lang;
const Signals = imports.signals;

const _TITLE_ENTRY_TIMEOUT = 200;

const PropertiesDialog = new Lang.Class({
    Name: 'PropertiesDialog',
 	
    _init: function(urn) {
        this._urn = urn; 
        let doc = Global.documentManager.getItemById(this._urn);

        if (doc instanceof Documents.LocalDocument ){
            this._sourceLink = Gio.file_new_for_uri(doc.uri).get_parent();
            this._sourcePath = this._sourceLink.get_path();
        } 

        let _dateModified = GLib.DateTime.new_from_unix_local(doc.mtime);
        this._dateModifiedString = _dateModified.format('%c');

        if (doc.dateCreated != -1) {
            let _dateCreated = GLib.DateTime.new_from_unix_local(doc.dateCreated);
            this._dateCreatedString = _dateCreated.format('%c');
        } else {
            this._dateCreatedString = null;
        }

        this.docId = doc.id;
        this._titleEntryTimeout = 0;

        let toplevel = Global.application.get_windows()[0];
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

        this._message = new Gtk.Label ({ label: '<span size="large"><b>' + _("Properties") + '</b></span>', //Label for Properties dialog
                                         halign: Gtk.Align.CENTER,
                                         use_markup: true, 
                                         hexpand: false });
        grid.attach (this._message, 1, 0, 1, 1);
        
        this._title = new Gtk.Label({ label: _("Title"), //Label for Title item in Properties dialog
                                      halign: Gtk.Align.END });
        this._title.get_style_context ().add_class('dim-label')
        grid.add(this._title);

        this._author = new Gtk.Label({ label: _("Author"), //Label for Author item in Properties dialog
                                       halign: Gtk.Align.END });
        this._author.get_style_context ().add_class('dim-label')
        grid.add(this._author);
     
        this._source = new Gtk.Label({ label: _("Source"), //Label for Source item in Properties dialog
                                       halign: Gtk.Align.END });
        this._source.get_style_context ().add_class('dim-label')
        grid.add (this._source);

        this._dateModified = new Gtk.Label({ label: _("Date Modified"), //Label for Date Modified item in Properties dialog
                                             halign: Gtk.Align.END });
        this._dateModified.get_style_context ().add_class('dim-label')
        grid.add (this._dateModified);

        if (this._dateCreated) {
            this._dateCreated = new Gtk.Label({ label: _("Date Created"), //Label for Date Created item in Properties dialog
                                                halign: Gtk.Align.END });
            this._dateCreated.get_style_context ().add_class('dim-label') 
            grid.add (this._dateCreated);
        }

        this._docType = new Gtk.Label({ label: _("Type"), //Label for document Type in Properties dialog
                                        halign: Gtk.Align.END });
        this._docType.get_style_context ().add_class('dim-label')
        grid.add (this._docType);

        if (doc instanceof Documents.LocalDocument) {
            this._titleEntry = new Gtk.Entry({ text: doc.name,
                                               editable: true,
                                               hexpand: true,
                                               halign: Gtk.Align.START });
        grid.attach_next_to (this._titleEntry, this._title, 1, 2, 1);
            this._titleEntry.connect("changed", Lang.bind (this, 
            function(newTitle, docId) { 
                if (this._titleEntryTimeout != 0) {
                    Mainloop.source_remove(this._titleEntryTimeout);
                    this._titleEntryTimeout = 0;
                }

                this._titleEntryTimeout = Mainloop.timeout_add(_TITLE_ENTRY_TIMEOUT, Lang.bind(this,
                    function() {
                        this._titleEntryTimeout = 0;
                        this.newTitle = this._titleEntry.get_text();
                        TrackerUtils.setEditedName(this.newTitle, this.docId, null);
                }));
            }));
        } else {
        this._titleEntry = new Gtk.Label({ label: doc.name,
                                           halign: Gtk.Align.START });
        grid.attach_next_to (this._titleEntry, this._title, 1, 2, 1);
        }

        this._authorData = new Gtk.Label({ label: doc.author,
                                           halign: Gtk.Align.START });
        grid.attach_next_to (this._authorData, this._author, 1, 2, 1);

        if (doc instanceof Documents.LocalDocument ){
            this._sourceData = new Gtk.LinkButton({ label: this._sourcePath,
                                                    uri: this._sourceLink.get_uri(),
                                                    halign: Gtk.Align.START });
        } else if (doc instanceof Documents.GoogleDocument) {
            this._sourceData = new Gtk.LinkButton({ label: doc.sourceName,
                                                    uri: "http://docs.google.com/",
                                                    halign: Gtk.Align.START });
        } else if (doc instanceof Documents.SkydriveDocument) {
            this._sourceData = new Gtk.LinkButton({ label: doc.sourceName,
                                                    uri: "https://skydrive.live.com",
                                                    halign: Gtk.Align.START });
        }

        grid.attach_next_to (this._sourceData, this._source, 1, 2, 1);

        this._dateModifiedData = new Gtk.Label({ label: this._dateModifiedString,
                                                 halign: Gtk.Align.START });
        grid.attach_next_to (this._dateModifiedData, this._dateModified, 1, 2, 1);

        if (this._dateCreated) {
            this._dateCreatedString = new Gtk.Label({ label: this._dateCreated,
                                                      halign: Gtk.Align.START });
        grid.attach_next_to (this._dateCreatedData, this._dateCreated, 1, 2, 1);
        }

        this._documentTypeData = new Gtk.Label({ label: doc.typeDescription,
                                                 halign: Gtk.Align.START });
        grid.attach_next_to (this._documentTypeData, this._docType, 1, 2, 1);

        contentArea.pack_start(grid, true, true, 2);
        this.widget.show_all();
    },


});

