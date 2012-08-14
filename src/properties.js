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

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const _ = imports.gettext.gettext;

const Documents = imports.documents;
const Global = imports.global;
const Mainloop = imports.mainloop;
const TrackerUtils = imports.trackerUtils;

const Lang = imports.lang;

const _TITLE_ENTRY_TIMEOUT = 200;

const PropertiesDialog = new Lang.Class({
    Name: 'PropertiesDialog',

    _init: function(urn) {
        let doc = Global.documentManager.getItemById(urn);

        let dateModified = GLib.DateTime.new_from_unix_local(doc.mtime);
        let dateModifiedString = dateModified.format('%c');

        let dateCreatedString = null;
        if (doc.dateCreated != -1) {
            let dateCreated = GLib.DateTime.new_from_unix_local(doc.dateCreated);
            dateCreatedString = dateCreated.format('%c');
        }

        let toplevel = Global.application.get_windows()[0];
        this.widget = new Gtk.Dialog ({ resizable: false,
                                        transient_for: toplevel,
                                        modal: true,
                                        destroy_with_parent: true,
                                        default_width: 400,
                                        hexpand: true });
        this.widget.add_button(_("Done"), Gtk.ResponseType.OK);

        let grid = new Gtk.Grid ({ orientation: Gtk.Orientation.VERTICAL,
                                   column_homogeneous: true,
                                   halign: Gtk.Align.CENTER,
                                   row_spacing: 12,
                                   column_spacing: 24,
                                   margin_left: 24,
                                   margin_right: 24,
                                   margin_bottom: 12 });

        let contentArea = this.widget.get_content_area();
        contentArea.pack_start(grid, true, true, 2);

        // Properties dialog heading
        let str = '<span size="large"><b>' + _("Properties") + '</b></span>';
        this._message = new Gtk.Label ({ label: str,
                                         halign: Gtk.Align.CENTER,
                                         use_markup: true,
                                         hexpand: false });
        grid.attach (this._message, 1, 0, 1, 1);

        // Title item
        this._title = new Gtk.Label({ label: _("Title"),
                                      halign: Gtk.Align.END });
        this._title.get_style_context ().add_class('dim-label');
        grid.add(this._title);

        // Author item
        if (doc.author) {
            this._author = new Gtk.Label({ label: _("Author"),
                                           halign: Gtk.Align.END });
            this._author.get_style_context ().add_class('dim-label');
            grid.add(this._author);
        }

        // Source item
        this._source = new Gtk.Label({ label: _("Source"),
                                       halign: Gtk.Align.END });
        this._source.get_style_context ().add_class('dim-label');
        grid.add (this._source);

        // Date Modified item
        this._dateModified = new Gtk.Label({ label: _("Date Modified"),
                                             halign: Gtk.Align.END });
        this._dateModified.get_style_context ().add_class('dim-label');
        grid.add (this._dateModified);

        // Date Created item
        if (dateCreatedString) {
            this._dateCreated = new Gtk.Label({ label: _("Date Created"),
                                                halign: Gtk.Align.END });
            this._dateCreated.get_style_context ().add_class('dim-label');
            grid.add (this._dateCreated);
        }

        // Document type item
        this._docType = new Gtk.Label({ label: _("Type"),
                                        halign: Gtk.Align.END });
        this._docType.get_style_context ().add_class('dim-label');
        grid.add (this._docType);

        // Title value
        if (doc instanceof Documents.LocalDocument) {
            this._titleEntry = new Gtk.Entry({ text: doc.name,
                                               editable: true,
                                               hexpand: true,
                                               halign: Gtk.Align.START });
            grid.attach_next_to (this._titleEntry, this._title, 1, 2, 1);

            let docId = doc.id;
            this._titleEntryTimeout = 0;

            this._titleEntry.connect('changed', Lang.bind (this,
                function() {
                    if (this._titleEntryTimeout != 0) {
                        Mainloop.source_remove(this._titleEntryTimeout);
                        this._titleEntryTimeout = 0;
                    }

                    this._titleEntryTimeout = Mainloop.timeout_add(_TITLE_ENTRY_TIMEOUT, Lang.bind(this,
                        function() {
                            this._titleEntryTimeout = 0;
                            let newTitle = this._titleEntry.get_text();
                            TrackerUtils.setEditedName(newTitle, docId, null);
                        }));
                }));
        } else {
            this._titleEntry = new Gtk.Label({ label: doc.name,
                                               halign: Gtk.Align.START });
            grid.attach_next_to (this._titleEntry, this._title, 1, 2, 1);
        }

        // Author value
        if (this._author) {
            this._authorData = new Gtk.Label({ label: doc.author,
                                               halign: Gtk.Align.START });
            grid.attach_next_to (this._authorData, this._author, 1, 2, 1);
        }

        // Source value
        if (doc instanceof Documents.GoogleDocument) {
            this._sourceData = new Gtk.LinkButton({ label: doc.sourceName,
                                                    uri: 'http://docs.google.com/',
                                                    halign: Gtk.Align.START });
        } else if (doc instanceof Documents.SkydriveDocument) {
            this._sourceData = new Gtk.LinkButton({ label: doc.sourceName,
                                                    uri: 'https://skydrive.live.com',
                                                    halign: Gtk.Align.START });
        } else { // local document
            let sourceLink = Gio.file_new_for_uri(doc.uri).get_parent();
            let sourcePath = sourceLink.get_path();

            this._sourceData = new Gtk.LinkButton({ label: sourcePath,
                                                    uri: sourceLink.get_uri(),
                                                    halign: Gtk.Align.START });
        }

        grid.attach_next_to (this._sourceData, this._source, 1, 2, 1);

        // Date Modified value
        this._dateModifiedData = new Gtk.Label({ label: dateModifiedString,
                                                 halign: Gtk.Align.START });
        grid.attach_next_to (this._dateModifiedData, this._dateModified, 1, 2, 1);

        // Date Created value
        if (this._dateCreated) {
            this._dateCreatedData = new Gtk.Label({ label: dateCreatedString,
                                                    halign: Gtk.Align.START });
            grid.attach_next_to (this._dateCreatedData, this._dateCreated, 1, 2, 1);
        }

        // Document type value
        this._documentTypeData = new Gtk.Label({ label: doc.typeDescription,
                                                 halign: Gtk.Align.START });
        grid.attach_next_to (this._documentTypeData, this._docType, 1, 2, 1);

        this.widget.show_all();
    }
});
