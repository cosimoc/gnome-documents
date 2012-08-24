/*
 * Copyright(c) 2012 Meg Ford
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

const Clutter = imports.gi.Clutter;
const Gd = imports.gi.Gd;
const GdPrivate = imports.gi.GdPrivate;
const GData = imports.gi.GData;
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
const Query = imports.query;
const Selections = imports.selections;
const TrackerUtils = imports.trackerUtils;
const Utils = imports.utils;
const View = imports.view;

const Lang = imports.lang;
const Signals = imports.signals;

const SharingDialogColumns = {
    NAME: 0,
    ROLE: 1
};

const SharingDialog = new Lang.Class({
    Name: 'SharingDialog',

    _init: function() {
        let urn = Global.selectionController.getSelection();
        let doc = Global.documentManager.getItemById(urn);

        this.identifier = doc.identifier;
        this.resourceUrn = doc.resourceUrn;

        this.entry = null;
        this._createGDataEntry();

        let toplevel = Global.application.get_windows()[0];

        this.widget = new Gtk.Dialog({ resizable: false,
                                       transient_for: toplevel,
                                       modal: true,
                                       destroy_with_parent: true,
                                       default_width: 100,
                                       default_height: 200,
                                       margin_top: 5,
                                       title: _("Sharing Settings"),
                                       hexpand: true });
        this.widget.add_button(_("Done"), Gtk.ResponseType.OK);  //Label for Done button in Sharing dialog

        let largeGrid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                       column_homogeneous: false,
                                       row_spacing: 3,
                                       margin_left: 12,
                                       margin_right: 12,
                                       margin_bottom: 12});
      	let contentArea = this.widget.get_content_area();
        contentArea.pack_start(largeGrid, true, true, 1);

        let sw = new Gtk.ScrolledWindow({ shadow_type: Gtk.ShadowType.IN,
                                          margin_bottom: 3,
                                          hexpand: true });
        sw.set_size_request(-1, 250);
        largeGrid.attach(sw, 0, 0, 3, 1);

        this.model = Gtk.ListStore.new(
            [ GObject.TYPE_STRING,
              GObject.TYPE_STRING ]);

        this.tree = new Gtk.TreeView({ headers_visible: false,
                                       vexpand: true,
                                       hexpand: true });
        this.tree.set_model(this.model);
        this.tree.show();
        sw.add(this.tree);

        this._viewCol = new Gtk.TreeViewColumn();
        this.tree.append_column(this._viewCol);

        // name column
        this._rendererText = new Gtk.CellRendererText({ xpad: 6,
                                                        ypad: 4 });
        this._viewCol.pack_start(this._rendererText, true);
        this._viewCol.add_attribute(this._rendererText,
                                    'text', SharingDialogColumns.NAME);

        // role column
        this._rendererDetail = new GdPrivate.StyledTextRenderer({ xpad: 16 });
        this._rendererDetail.add_class('dim-label');
        this._viewCol.pack_start(this._rendererDetail, false);
        this._viewCol.add_attribute(this._rendererDetail,
                                    'text', SharingDialogColumns.ROLE);

        this._docSharing = new Gtk.Label ({ label: '<b>' + _("Document permissions") + '</b>', //Label for widget group used for adding new contacts
                                            halign: Gtk.Align.START,
                                            use_markup: true,
                                            hexpand: false });
        this._docSharing.get_style_context().add_class('dim-label');
        largeGrid.add(this._docSharing);

        if(doc.shared)
            this._permissionLabel = _("Shared"); //label for shared permission setting
        else
            this._permissionLabel = _("Private"); //label for private permission setting
        this._setting = new Gtk.Label({ label: _(this._permissionLabel),
                                        halign: Gtk.Align.START,
                                        hexpand: false });
        largeGrid.add(this._setting);

        this._changePermission = new Gtk.Button({ label: _("Change"), //Label for permission change in Sharing dialog
                                                  halign: Gtk.Align.START });
        this._changePermission.connect("clicked", Lang.bind(this, this._permissionPopUp));
        largeGrid.attach_next_to (this._changePermission, this._setting, 1, 1, 1);

        this._add = new Gtk.Label ({ label: '<b>' +  _("Add people") + '</b>', //Label for widget group used for adding new contacts
                                     halign: Gtk.Align.START,
                                     use_markup: true,
                                     hexpand: false });
        this._add.get_style_context().add_class('dim-label');
        largeGrid.add(this._add);

        this._addContact = new Gtk.Entry({ text: _("Enter an email address"), //Editable text in entry field
                                           editable: true,
                                           hexpand: true,
                                           halign: Gtk.Align.START });
        largeGrid.add(this._addContact);

        this._comboBoxText = new Gtk.ComboBoxText({ halign: Gtk.Align.START });
        let combo = [_("Set permission"), _("Can edit"), _("Can view") ]; //Permission setting labels in combobox
        for (let i = 0; i < combo.length; i++)
            this._comboBoxText.append_text(combo[i]);

        this._comboBoxText.set_active(0);
        largeGrid.attach_next_to(this._comboBoxText, this._addContact, 1, 1, 1);

      /* There is no API for this
        this._notify = new Gtk.CheckButton({ label: _("Notify contact via gmail") }); //Label for checkbutton
        largeGrid.add(this._notify);
        this._notify.set_active(false);
        //send an email with link to document via Google
        this._notify.connect("toggled", Lang.bind(this, this._prepareEmail));
                                                                            */

        this._saveShare = new Gtk.Button({ label: _("Add") });
        this._saveShare.connect ("clicked", Lang.bind(this, this._onAdd));
        largeGrid.attach_next_to(this._saveShare, this._comboBoxText, 1, 1, 1);

        this.widget.show_all();
    },

    _permissionPopUp: function() { //this needs to be themed, right now it is ugly
        this.popUpWindow  = new Gtk.Dialog({ resizable: false,
                                             transient_for: this.widget,
                                             modal: true,
                                             destroy_with_parent: true,
                                             default_width: 400,
                                             default_height: 600,
                                             hexpand: false });

        let popUpGrid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL,
                                       column_homogeneous: true,
                                       halign: Gtk.Align.CENTER,
                                       row_spacing: 12,
                                       column_spacing: 24,
                                       margin_left: 24,
                                       margin_right: 24,
                                       margin_bottom: 12 });

        this._label = new Gtk.Label({ label: '<b>' + _("Sharing Settings") + '</b>', //Label for permissions dialog
                                      halign: Gtk.Align.END,
                                      use_markup: true });
        this._label.get_style_context().add_class('dim-label');
        popUpGrid.add(this._label);

        this.button1 = new Gtk.RadioButton ({ label: "Shared with link" }); //Label for radiobutton that sets doc permission to shared
        this.button1.connect("toggled", Lang.bind (this, this._setDocumentPermission));
        this.button1.set_active (false);
        popUpGrid.attach(this.button1, 0, 2, 1, 1);

        this.button2 =  new Gtk.RadioButton({ label: "Private",  //Label for radiobutton that sets doc permission to private
                                              group: this.button1 });
        this.button2.connect("toggled", Lang.bind(this, this._setDocumentPermission));
        this.button2.set_active (true);
        popUpGrid.attach(this.button2, 0, 3, 1, 1);

        this.button3 = new Gtk.RadioButton({ label: "Public", //Label for radiobutton that sets doc permission to public
                                             group: this.button1 });
        this.button3.connect("toggled", Lang.bind(this, this._setDocumentPermission));
        popUpGrid.attach(this.button3, 0, 4, 1, 1);

        this._close = new Gtk.Button({ label: "Done" });//Label for Done button permissions popup window
        this._close.connect("clicked", Lang.bind(this, this._destroyPopUpWindow));
        popUpGrid.add(this._close);

        let popUpContentArea = this.popUpWindow.get_content_area();
        popUpContentArea.pack_start(popUpGrid, true, true, 2);
        this.popUpWindow.show_all();
    },

    //Get the id of the selected doc from the sourceManager, give auth info to Google, and start the service
    _createGDataEntry: function() {
        let source = Global.sourceManager.getItemById(this.resourceUrn);

        let authorizer = new GData.GoaAuthorizer({ goa_object: source.object });
        let service = new GData.DocumentsService({ authorizer: authorizer });

        //query the service for the entry related to the doc
        service.query_single_entry_async
            (service.get_primary_authorization_domain(),
            this.identifier, null,
            GData.DocumentsText, null, Lang.bind(this,
                function(object, res) {
                    try {
                        this.entry = object.query_single_entry_finish(res);
                        this._getGDataEntryRules(this.entry, service);
                    } catch (e) {
                        log("Error getting GData Entry " + e.message);
                    }
                }));
    },

   //return a feed containing the acl related to the entry
    _getGDataEntryRules: function(entry, service) {
         this.entry.get_rules_async(service, null, null, Lang.bind(this,
             function(entry, result) {
                 try {
                     let feed = service.query_finish(result);
                     this._getScopeRulesEntry(feed);
                     // this._sendNewPermission(feed, entry, result, service);
	         } catch(e) {
                     log("Error getting ACL Feed " + e.message);
	         }
             }));
    },

     //get each entry (person) from the feed, and get the scope for each person, and then store the emails and values in an array
     _getScopeRulesEntry: function(feed) {
         let entries = feed.get_entries();
         let values = [];

         entries.forEach(Lang.bind(this,
             function(entry) {
                 let [type, value] = entry.get_scope();
                 let role = entry.get_role();

                 values.push({ name: value, role: this._getUserRoleString(role) });
             }));

         // set values in the treemodel
         values.forEach(Lang.bind (this,
             function(value) {
                 let iter = this.model.append();
                 this.model.set(iter,
                     [ SharingDialogColumns.NAME,
                       SharingDialogColumns.ROLE ],
                     [ value.name, value.role ]);
         }));
    },

    //get the roles, and make a new array containing strings
    _getUserRoleString: function(role) {
        if(role.charAt(0) == 'o')
            return _("Owner");

        if(role.charAt(0) == 'w')
            return _("Writer");

        if(role.charAt(0) == 'r')
            return _("Reader");

        return '';
    },

    //this isn't finished
     _sendNewPermission: function() {
         let source = Global.sourceManager.getItemById(this.resourceUrn);

         let authorizer = new GData.GoaAuthorizer({ goa_object: source.object });
         let service = new GData.DocumentsService({ authorizer: authorizer });
         let accessRule = new GData.AccessRule();

         let newContact = this._getNewContact();
         accessRule.set_role(newContact.role);
         accessRule.set_scope(GData.ACCESS_SCOPE_USER, newContact.name);

         let aclLink = this.entry.look_up_link(GData.LINK_ACCESS_CONTROL_LIST);

         service.insert_entry_async(service.get_primary_authorization_domain(),
             aclLink.get_uri(), accessRule, null, Lang.bind(this,
                 function(service, res) {
                     try {
                         let insertedAccessRule = service.insert_entry_finish(res);
                     } catch(e) {
                         log("Error inserting new ACL rule " + e.message);
		     }
                 }));
    },

    _getNewContact: function() {
        let activeItem = this._comboBoxText.get_active();
        let newContact = { name: this._addContact.get_text() };

        if (activeItem == 1)
            newContact.role = GData.DOCUMENTS_ACCESS_ROLE_WRITER;
        else if (activeItem == 2)
            newContact.role = GData.DOCUMENTS_ACCESS_ROLE_READER;

        return newContact;
    },

    _setDocumentPermission: function() {
        log('TODO: not implemented');
    },

 /* There is no API for this
      _prepareEmail: function() {
        if(this._notify.get_active()){
           this.email = true;
            log("share");
        }
    },
                                    */

    _onAdd: function(){
        this._sendNewPermission();

   },

    _destroyPopUpWindow : function() {
       this.popUpWindow.destroy();
   }
});
