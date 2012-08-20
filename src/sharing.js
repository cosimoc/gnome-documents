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

const OrganizeModelColumns = {
    ID: 0,
    NAME:1
};

const SharingDialog = new Lang.Class({
    Name: 'SharingDialog',
 	
    _init: function() {
        let urn = Global.selectionController.getSelection(); 
        let doc = Global.documentManager.getItemById(urn);

        this._contributor = doc.contributor;
        this._docId = doc.id;
        this.identifier = doc.identifier;
        this.resourceUrn = doc.resourceUrn;
             
        this.writer = false;
        this.reader = false;
        this.newContact = null;
        this.ownerVal = "Owner";
        this.writerVal = "Writer";
        this.readerVal = "Reader";        
        this.roleArr = [];
        this._createGDataEntry();
        

        let toplevel = Global.application.application.get_windows()[0];

        this.widget = new Gtk.Dialog({ resizable: false, 
                                       transient_for: toplevel,
                                       modal: true,
                                       destroy_with_parent: true,
                                       default_width: 100,
                                       default_height: 200,
                                       margin_top: 5, 
                                       hexpand: true });

        let largeGrid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL, 
                                       column_homogeneous: false,
                                       halign: Gtk.Align.CENTER,
                                       row_spacing: 3,
                                       margin_left: 12,
                                       margin_right: 12,
                                       margin_bottom: 12});

        let sw = new Gtk.ScrolledWindow({ shadow_type: Gtk.ShadowType.IN,
                                          margin_left: 6,
                                          margin_bottom: 3 });                              	
        sw.set_size_request(300, 300);
        
        let grid = new Gtk.Grid({ orientation: Gtk.Orientation.VERTICAL, 
                                  column_homogeneous: false,
                                  halign: Gtk.Align.CENTER,
                                  row_spacing: 12,
                                  column_spacing: 3,
                                  margin_top: 12,
                                  margin_bottom: 12});

        this.widget.add_button('Done', Gtk.ResponseType.OK); //Label for Done button in Sharing dialog 
        
        this._label = new Gtk.Label ({ label: '<b>' + _("Sharing Settings") + '</b>', //Label for Sharing dialog
                                       halign: Gtk.Align.END,
                                       use_markup: true });
        this._label.get_style_context ().add_class('dim-label');
        largeGrid.add(this._label);



        this.model = Gtk.ListStore.new(
            [ GObject.TYPE_STRING,
              GObject.TYPE_STRING ]);

        let iter = this.model.append();
        this.model.set(iter,
            [ 0 , 1 ],
            [ "author" , "this.roleEntry = roleArr(pop)" ]);

        this.tree = new Gtk.TreeView({ headers_visible: false,
                                       vexpand: true,
                                       hexpand: true });
        this.tree.set_model(this.model);
        this._viewCol = new Gtk.TreeViewColumn();
        this.tree.append_column(this._viewCol);

        // item name
        this._rendererText = new Gtk.CellRendererText();
        this._viewCol.pack_start(this._rendererText, true);
        this._viewCol.add_attribute(this._rendererText,
                                    'text', OrganizeModelColumns.NAME);

        this._rendererDetail = new Gd.StyledTextRenderer({ xpad: 16 });
        this._rendererDetail.add_class('dim-label');
        this._viewCol.pack_start(this._rendererDetail, false);
        this._viewCol.set_cell_data_func(this._rendererDetail,
                                         Lang.bind(this, this._detailCellFunc));

        this.tree.show();
        grid.add(this.tree);
        sw.add_with_viewport(grid);
      	let contentArea = this.widget.get_content_area();
      
        this._done = new Gtk.Button(); 

        largeGrid.add(sw);

        this._docSharing = new Gtk.Label ({ label: _("Document permissions"), //Label for widget group used for adding new contacts
                                            halign: Gtk.Align.START,
                                            // use_markup: true, 
                                            hexpand: false });
        largeGrid.add(this._docSharing);

        if(doc.shared)
            this._permissionLabel = "Shared"; //label for shared permission setting 
        else 
            this._permissionLabel = "Private"; //label for private permission setting      
        this._setting = new Gtk.Label({ label: _(this._permissionLabel), 
                                        halign: Gtk.Align.START,
                                        //use_markup: true, 
                                        hexpand: false });
        largeGrid.add(this._setting);

        this._changePermission = new Gtk.Button({ label: _("Change"), //Label for permission change in Sharing dialog
                                                  halign: Gtk.Align.START });
        this._changePermission.connect("clicked", Lang.bind(this, this._permissionPopUp));
        largeGrid.attach_next_to (this._changePermission, this._setting, 1, 1, 1); 
               
        this._add = new Gtk.Label ({ label: _("Add people"), //Label for widget group used for adding new contacts
                                     halign: Gtk.Align.START,
                                     use_markup: true, 
                                     hexpand: false });
        largeGrid.add(this._add);

        this._addContact = new Gtk.Entry({ text: _("Enter an email address"), //Editable text in entry field
                                           editable: true,
                                           hexpand: true,
                                           halign: Gtk.Align.START });
        largeGrid.add(this._addContact);
        this._addContact.connect("changed", Lang.bind (this, this._setNewContact));

        this._comboBoxText = new Gtk.ComboBoxText({ halign: Gtk.Align.START });
        let combo = ["Set permission", "Can edit", "Can view" ]; //Permission setting labels in combobox
        for (let i = 0; i < combo.length; i++)
            this._comboBoxText.append_text(combo[i]);

        this._comboBoxText.set_active(0);
        this._comboBoxText.connect('changed', Lang.bind(this, this._setNewContactPermission));
        largeGrid.attach_next_to(this._comboBoxText, this._addContact, 1, 1, 1);

        this._notify = new Gtk.CheckButton({ label: _("Notify contact via gmail") }); //Label for checkbutton
        largeGrid.add(this._notify);
        this._notify.set_active(false); 
        //send an email with link to document via Google
        this._notify.connect("toggled", Lang.bind(this, this._prepareEmail));

        let buttonBox = new Gtk.ButtonBox({ orientation: Gtk.Orientation.HORIZONTAL });
        this._saveShare = new Gtk.Button({ label: "Add" }); 
        this._saveShare.connect ("clicked", Lang.bind(this, this._onAdd));
        largeGrid.attach_next_to(this._saveShare, this._comboBoxText, 1, 1, 1); 
       
        contentArea.pack_start(largeGrid, true, true, 1);
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

        this._label = new Gtk.Label({ label: '<b>'+_("Sharing Settings")+'</b>', //Label for permissions dialog
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

    _createGDataEntry: function() {
        let source = Global.sourceManager.getItemById(this.resourceUrn);

        let authorizer = new Gd.GDataGoaAuthorizer({ goa_object: source.object });
        let service = new GData.DocumentsService({ authorizer: authorizer }); 

        service.query_single_entry_async
            (service.get_primary_authorization_domain(),
                this.identifier, null,
                    GData.DocumentsText,
                    null, Lang.bind(this,
                        function(object, res) {
                            let entry = null;
                            let exception = null;

                            try {
                                entry = object.query_single_entry_finish(res);
                                log(entry);
                                this._getGDataEntryRules(entry, service);
                            } catch (e) {
                                exception = e;
                                log("Error getting GData Entry" + e.message);   
                            }         
                                
                     }));
    },
 
    _getGDataEntryRules: function(entry, service) {  
         entry.get_rules_async
            (service,
             null,
             null,
             Lang.bind(this, this._onGetRulesComplete, service));
    }, 

    _onGetRulesComplete: function(entry, result, service) {
         let exception = null;
         try {
             let feed = service.query_finish(result);
             log(feed); 
             if(feed)
                this._getScopeRulesEntry(feed);
                this._getRoleRulesEntry(feed); 
		 } catch(e) {
             exception = e;
             log("Error getting ACL Feed " + e.message);  
		 }        
	 },
     
     _getScopeRulesEntry: function(feed) {
         let _scope = [];
         let exception = null;
         try {
             let entries = feed.get_entries();
             entries.forEach(Lang.bind(this, function(entry) {
             let [type, value] = entry.get_scope();
             _scope.push({ type: type, value: value });
             }));
         } catch(e) {
		     exception = e;
             log("Error getting ACL Feed Entries " + e.message);  
	     }
         log(_scope);
         this._getUserPermission(_scope);         
    },
   
    _getUserPermission: function(_scope) {
        let rule = [];            
            _scope.forEach(Lang.bind(this, function(_scope) {
                rule = _scope;
                this.value = rule.value;           
                log(this.value);
            }));                 
    },   

    _getRoleRulesEntry: function(feed) {
        let _role = [];
        let exception = null;
            try {
                let entries = feed.get_entries();
                entries.forEach(Lang.bind(this, function(entry) {
                let [role] = entry.get_role();
             _role.push({ role: role });
             }));
            } catch(e) {
		        exception = e;
                log("Error getting ACL Role Rules " + e.message);  
	     }
         log(_role);         
         this._getUserRole(_role); 
    },

   _getUserRole: function(_role) {            
       _role.forEach(Lang.bind(this, function(_role) {
           this.userRole = _role.role;
         
           if(this.userRole.charAt(0) == 'o')
               this.roleArr.push(this.ownerVal);

           if(this.userRole.charAt(0) == 'w')
               this.roleArr.push(this.writerVal);
            
           if(this.userRole.charAt(0) =='r')
               this.roleArr.push(this.readerVal);
           log(this.roleArr);  
       })); 
                           
    },
        
    _setNewContact: function() {
       this.newContact = this._addContact.get_text();             
    },

    _getNewContact: function() {
        return this.newContact;
    },
  
    _setNewContactPermission: function() {
        let activeItem = this._comboBoxText.get_active();
        if(activeItem == 1) {
            log("1");
            this.writer = true;
        }
        if(activeItem == 2) {
           log("2");
            this.reader = true;
        }
    },

    _prepareEmail: function() {
        if(this._notify.get_active()){
           this.email = true;
            log("share");//send email
        }             
    },

   _onAdd: function(){
       this._getNewContact();
           log(this.newContact);
          // if(this.newContact != '')
                   
         
       if(this.writer)
           // .set_role(GData.DocumentsEntry{( access_role: writer)};//pseduocode
           log("writer");
       if(this.reader)
           log("reader");
            //scopeType.set_role(GData.DocumentsEntry{( access_role: reader )};//pseudocode
       if(this.email)
           log("send email");  
   },
     
    _destroyPopUpWindow : function() {
       this.popUpWindow.destroy();
   },    

    _detailCellFunc: function(col, cell, model, iter) {       
       let urn = Global.selectionController.getSelection(); 
       let doc = Global.documentManager.getItemById(urn);
           if(doc.contributor){
               cell.text = doc.contributor;//replace with scope value
               cell.visible = true;
           }
     }

});

