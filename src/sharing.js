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

const _CONTACT_PLACEHOLDER_ID = 'contact-placeholder';

const SharingDialog = new Lang.Class({
    Name: 'SharingDialog',
 	
    _init: function() {
        let urn = Global.selectionController.getSelection();
        this._urn = urn; 
        let doc = Global.documentManager.getItemById(this._urn);

        this._docId = doc.id;
        this._contributor = doc.contributor;
        this._resourceUrn = doc.resourceUrn;
        this._identifier = doc.identifier;
        
	    
        let toplevel = Global.application.application.get_windows()[0];

        //list the widgets from largest to smallest
        this.widget = new Gtk.Dialog ({ resizable: false, 
                	                    transient_for: toplevel,
                        	            modal: true,
                                	    destroy_with_parent: true,
                                        default_width: 100, 
					                    default_height: 200,
                                        margin_top: 5, 
                                        hexpand: true });

        let largeGrid = new Gtk.Grid ({ orientation: Gtk.Orientation.VERTICAL, 
        	                            column_homogeneous: true,
                	                    halign: Gtk.Align.CENTER,
                        	            row_spacing: 12,
                                        margin_left: 12,
                                        margin_right: 12,
				                        margin_bottom: 12});


        let sw = new Gtk.ScrolledWindow({ shadow_type: Gtk.ShadowType.IN,
                                          margin_left: 6,
                                          margin_bottom: 3 });                              	
        sw.set_size_request(300, 300);
        let collView = new OrganizeCollectionView();

        let grid = new Gtk.Grid ({ orientation: Gtk.Orientation.VERTICAL, 
        	                       column_homogeneous: false,
                	               halign: Gtk.Align.CENTER,
                        	       row_spacing: 12,
                                   margin_top: 12,
				                   margin_bottom: 12});
        if(doc.shared)
            this._private = "shared";
        else 
            this._private = "private";        
     	this._setting = new Gtk.Label ({ label: _(this._private), //Label for Sharing dialog
                	                     halign: Gtk.Align.START,
                        	             use_markup: true, 
                             	         hexpand: false });
        grid.add(this._setting);
	 
	    this._changePermission = new Gtk.Button({ label: _("Change"), //Label for permission change in Sharing dialog
						                          halign: Gtk.Align.START });
        this._changePermission.connect ("clicked", Lang.bind(this, this._permissionPopUp));
        grid.attach_next_to (this._changePermission, this._setting, 1, 1, 1);  

        this._author = new Gtk.Label ({ label: _(doc.author), //Label for User Permission item in Sharing dialog
       	                               halign: Gtk.Align.START });//probably don't use sparql for this
        grid.add(this._author);     
	
        this._owner = new Gtk.Label ({ label: _("Is owner"), //Label for doc Owner in Sharing dialog
       	                               halign: Gtk.Align.START });
        this._owner.get_style_context ().add_class('dim-label')
        grid.attach_next_to(this._owner, this._author, 1, 1, 1);
       
        grid.add(collView.tree);
        sw.add_with_viewport(grid);
      	let contentArea = this.widget.get_content_area();
      
	    this._done = new Gtk.Button ({label: "Done"}); //Label for Done button in Sharing dialog
        this.widget.add_button ('Done', Gtk.ResponseType.OK); 
        
        this._label = new Gtk.Label ({ label: '<b>'+_("Sharing Settings")+'</b>', //Label for Permissions in Sharing dialog
       					               halign: Gtk.Align.END,
					                   use_markup: true });
        this._label.get_style_context ().add_class('dim-label')
	    largeGrid.add (this._label);
        largeGrid.add(sw);
        
        
        this._add = new Gtk.Label ({ label: _("Add people"), //Label for 
                	                    halign: Gtk.Align.START,
                        	            use_markup: true, 
                             	        hexpand: false });
        largeGrid.add(this._add);

        this._addContact = new Gtk.Entry({ text: _("Enter email addresses"), 
	       				                   editable: true,
					                       hexpand: true,
					                       halign: Gtk.Align.START });
        largeGrid.add(this._addContact);
	    this._addContact.connect("activate", Lang.bind (this, this._init));//replace with add contact code
        //I would like to set these so that they are invisible until they receive a "changed" signal from _addContact, 
        //but I don't see a method for this in GTK unless I put them in a toolbar, yuck.

        this._comboBoxText = new Gtk.ComboBoxText({  halign: Gtk.Align.START });
        let combo = ["Can edit", "Can comment", "Can view"];
        for (let i = 0; i < combo.length; i++)
            this._comboBoxText.append_text (combo[i]);

        this._comboBoxText.set_active (0);
        this._comboBoxText.connect ('changed', Lang.bind (this, this._init ));
        largeGrid.attach_next_to (this._comboBoxText, this._addContact, 1, 1, 1);

        this._notify = new Gtk.CheckButton ({ label: _("Notify people via email") });
     
        largeGrid.add (this._notify);
        this._notify.set_active (true); 
        this._notify.connect ("toggled", Lang.bind (this, this._init));//replace with don't send command? read this part of the api

        let buttonBox = new Gtk.ButtonBox({ orientation: Gtk.Orientation.HORIZONTAL});
        this._saveShare = new Gtk.Button({label: "Save and Share"}); 
        buttonBox.add (this._saveShare, Lang.bind (this, collView.addCollection, OrganizeCollectionDialogResponse.ADD ));

        this._ok = new Gtk.Button ({label: "OK"}); 
        buttonBox.add (this._ok, Gtk.ResponseType.OK); 
        largeGrid.add( buttonBox );  
        
		contentArea.pack_start(largeGrid, true, true, 1);
	    this.widget.show_all();
    },

	    _permissionPopUp: function() { //this needs to be themed, right now it is ugly
      	     this.popUpWindow  = new Gtk.Dialog ({ resizable: false, 
                			                       transient_for: this.widget,
                        			               modal: true,
                                		           destroy_with_parent: true,
						                           default_width: 400,
						                           default_height: 600,
                                       		       hexpand: false });
       
             let popUpGrid = new Gtk.Grid ({ orientation: Gtk.Orientation.VERTICAL, 
        				                     column_homogeneous: true,
                			                 halign: Gtk.Align.CENTER,
                        		             row_spacing: 12,
					                         column_spacing: 24,
					                         margin_left: 24,
					                         margin_right: 24,
					                         margin_bottom: 12 });

	        this._label = new Gtk.Label ({ label: '<b>'+_("Sharing Settings")+'</b>', //Label for Permissions in Sharing dialog
       					                   halign: Gtk.Align.END,
					                       use_markup: true });
            this._label.get_style_context ().add_class('dim-label')
	        popUpGrid.add (this._label);

	        this.button1 = new Gtk.RadioButton ({ label: "Shared" });
	        this.button1.connect("toggled", Lang.bind (this, this._init)); 
            this.button1.set_active (false);
	        //let active = this.button1.get_active();
	        popUpGrid.attach (this.button1, 0, 2, 1, 1);

	        this.button2 =  Gtk.RadioButton.new_from_widget(this.button1);
            this.button2.set_label("Private");
	        this.button2.connect("toggled", Lang.bind (this, this._getEntry));

            this.button2.set_active (true);
	        popUpGrid.attach(this.button2, 0, 3, 1, 1);
           
	    
	       let buttonGrid = new Gtk.Grid ({ orientation: Gtk.Orientation.VERTICAL, 
                                             column_homogeneous: true,
                                             halign: Gtk.Align.CENTER,
                        		             row_spacing: 12,
					                         column_spacing: 6,
					                         margin_left: 12,
					                         margin_right: 12,
					                         margin_bottom: 12});
		
	      this._close = new Gtk.Button ({label: "Done"});
	      this._close.connect ("clicked", Lang.bind(this, this._destroyPopUpWindow));
	      popUpGrid.add(this._close);
	      popUpGrid.add(buttonGrid);	   

          let popUpContentArea = this.popUpWindow.get_content_area();
	      popUpContentArea.pack_start (popUpGrid, true, true, 2);
	      this.popUpWindow.show_all();
         },

    _getEntry: function() {
                let source = Global.sourceManager.getItemById(this._resourceUrn);
                let authorizer = new Gd.GDataGoaAuthorizer({ goa_object: source.object });
                let service = new GData.DocumentsService({ authorizer: authorizer }); 

                service.query_single_entry_async
                 (service.get_primary_authorization_domain(),
                    this._identifier, null,
                    GData.DocumentsText,
                    null, Lang.bind(this,
                        function(object, res) {
                            let entry = null;
                            let exception = null;

                     try {
                         entry = object.query_single_entry_finish(res);
                         log(entry);
                         this._sendRules(entry, service);
                     } catch (e) {
                         exception = e;
                         log("error");   
                     }    
                    
                 }));
},
 
    _sendRules: function(entry, service) {  
         entry.get_rules_async
                        (service,
                            null,
                            null,
                Lang.bind(this, this._onGetRulesComplete, service));
  }, 

    _onGetRulesComplete: function(entry, result, service) {
         let feed = null;
         let exception = null;
        try {
		       let feed = service.query_finish(result);
                log(feed);
		      this._getRulesEntry(feed); 
		        } catch(e) {
		         exception = e;
                log("D:");  
		     }
	  },
     
     _getRulesEntry: function(feed) {
         var rule = [];
         var author = [];
         let exception = null;
        try {
	    for (var i = 0; i != null; i++) {
	   
       rule[i]= feed.get_scope();
       
      log("333!");   } }catch(e) {
		         exception = e;
              log(":(");  }
        
},
    

       _destroyPopUpWindow : function() {
           this.popUpWindow.destroy();
	  },
  });    

// fetch all the collections a given item is part of
const FetchCollectionsJob = new Lang.Class({//put read permissions code here
    Name: 'FetchCollectionsJob',

    _init: function(urn) {
        this._urn = urn;
       this._collections = [];
    },

    run: function(callback) {
        this._callback = callback;

        let query = Global.queryBuilder.buildFetchContactsQuery(this._urn);
        Global.connectionQueue.add(query.sparql, null, Lang.bind(this,
            function(object, res) {
                let cursor = null;

                try {
                    cursor = object.query_finish(res);
                    cursor.next_async(null, Lang.bind(this, this._onCursorNext));
                } catch (e) {
                    log(e);
                    this._emitCallback();
                }
            }));
    },

    _onCursorNext: function(cursor, res) {
        let valid = false;

        try {
            valid = cursor.next_finish(res);
        } catch (e) {
            log(e);
        }

        if (!valid) {
            cursor.close();
            this._emitCallback();

            return;
        }

        let urn = cursor.get_string(0)[0];
        this._collections.push(urn);

        cursor.next_async(null, Lang.bind(this, this._onCursorNext));
    },

    _emitCallback: function() {
        if (this._callback)
            this._callback(this._collections);
    }
});

// fetch the state of every collection applicable to the selected items//I think I can get rid of the state indicators, but I'm not sure if they are in any way connected to setting the iters, so I haven't gotten rid of them yet.
const OrganizeCollectionState = {
    NORMAL: 0,
    ACTIVE: 1 << 0,
    INCONSISTENT: 1 << 1,
    HIDDEN: 1 << 2
};

const FetchCollectionStateForSelectionJob = new Lang.Class({
    Name: 'FetchCollectionStateForSelectionJob',

    _init: function() {
        this._collectionsForItems = {};
        this._runningJobs = 0;
    },

    run: function(callback) {
        this._callback = callback;

        let urns = Global.selectionController.getSelection();
        urns.forEach(Lang.bind(this,
            function(urn) {
                let job = new FetchCollectionsJob(urn);

                this._runningJobs++;
                job.run(Lang.bind(this, this._jobCollector, urn));
            }));
    },

    _jobCollector: function(collectionsForItem, urn) {
        this._collectionsForItems[urn] = collectionsForItem;

        this._runningJobs--;
        if (!this._runningJobs)
            this._emitCallback();
    },

    _emitCallback: function() {
        let collectionState = {};
        let collections = Global.collectionManager.getItems();

        // for all the registered collections...
        for (collIdx in collections) {
            let collection = collections[collIdx];

            let found = false;
            let notFound = false;
            let hidden = false;

            // if the only object we are fetching collection state for is a
            // collection itself, hide this if it's the same collection.
            if (Object.keys(this._collectionsForItems).length == 1) {
                let itemIdx = Object.keys(this._collectionsForItems)[0];
                let item = Global.documentManager.getItemById(itemIdx);

                if (item.id == collection.id)
                    hidden = true;
            }

            for (itemIdx in this._collectionsForItems) {
                let item = Global.documentManager.getItemById(itemIdx);
                let collectionsForItem = this._collectionsForItems[itemIdx];

                // if one of the selected items is part of this collection...
                if (collectionsForItem.indexOf(collIdx) != -1)
                    found = true;
                else
                    notFound = true;

                if ((item.resourceUrn != collection.resourceUrn) &&
                    (collection.identifier.indexOf(Query.LOCAL_COLLECTIONS_IDENTIFIER) == -1)) {
                    hidden = true;
                }
            }

            let state = OrganizeCollectionState.NORMAL;

            if (found && notFound)
                // if some items are part of this collection and some are not...
                state |= OrganizeCollectionState.INCONSISTENT;
            else if (found)
                // if all items are part of this collection...
                state |= OrganizeCollectionState.ACTIVE;

            if (hidden)
                state |= OrganizeCollectionState.HIDDEN;

            collectionState[collIdx] = state;
        }

        if (this._callback)
            this._callback(collectionState);
    }
});

// updates the mtime for the given resource to the current system time
const UpdateMtimeJob = new Lang.Class({
    Name: 'UpdateMtimeJob',

    _init: function(urn) {
        this._urn = urn;
    },

    run: function(callback) {
        this._callback = callback;

        let query = Global.queryBuilder.buildUpdateMtimeQuery(this._urn);
        Global.connectionQueue.update(query.sparql, null, Lang.bind(this,
            function(object, res) {
                try {
                    object.update_finish(res);
                } catch (e) {
                    log(e);
                }

                if (this._callback)
                    this._callback();
            }));
    }
});

// adds or removes the selected items to the given collection
const SetCollectionForSelectionJob = new Lang.Class({
    Name: 'SetCollectionForSelectionJob',

    _init: function(collectionUrn, setting) {//re-write this to to take user and permission
        this._collectionUrn = collectionUrn;//user
        this._setting = setting;//permission
        this._runningJobs = 0;
    },

    run: function(callback) {
        this._callback = callback;

        let urns = Global.selectionController.getSelection();//don't add a user twice code goes here
        urns.forEach(Lang.bind(this,
            function(urn) {
                // never add a collection to itself!!
                if (urn == this._collectionUrn)
                    return;

                let query = Global.queryBuilder.buildSetCollectionQuery(urn,//code to send new users an permissions to google
                    this._collectionUrn, this._setting);
                this._runningJobs++;

                Global.connectionQueue.update(query.sparql, null, Lang.bind(this,
                    function(object, res) {
                        try {
                            object.update_finish(res);
                        } catch (e) {
                            log(e);
                        }

                        this._jobCollector();
                    }));
            }));
    },

    _jobCollector: function() {
        this._runningJobs--;

        if (this._runningJobs == 0) {
            let job = new UpdateMtimeJob(this._collectionUrn);
            job.run(Lang.bind(this,
                function() {

                    if (this._callback)
                        this._callback();
                }));
        }
    }
});

// creates an (empty) collection with the given name
const CreateCollectionJob = new Lang.Class({
    Name: 'CreateCollectionJob',

    _init: function(name) {//pass in (email and new permission)
        this._name = name;
        this._shared = null;
    },

    run: function(callback) {   
        this._callback = callback;

        let query = Global.queryBuilder.buildCreateCollectionQuery(this._name);//create new user with new permissions here
        Global.connectionQueue.updateBlank(query.sparql, null, Lang.bind(this,
            function(object, res) {
                let variant = null;
                try {
                    variant = object.update_blank_finish(res); // variant is aaa{ss}
                } catch (e) {
                    log(e);
                }

                variant = variant.get_child_value(0); // variant is now aa{ss}
                variant = variant.get_child_value(0); // variant is now a{ss}
                variant = variant.get_child_value(0); // variant is now {ss}

                let key = variant.get_child_value(0).get_string()[0];
                let val = variant.get_child_value(1).get_string()[0];

                if (key == 'res')
                    this._createdUrn= val;

                if (this._callback)
                    this._callback(this._createdUrn);
            }));
    }
});

const OrganizeModelColumns = {
    ID: 0,
    NAME: 1,
    STATE: 2
};

const OrganizeCollectionModel = new Lang.Class({
    Name: 'OrganizeCollectionModel',

    _init: function() {
        this.model = Gtk.ListStore.new(
            [ GObject.TYPE_STRING,
              GObject.TYPE_STRING,
              GObject.TYPE_INT ]);
        this._placeholderRef = null;

        this._collAddedId =
            Global.collectionManager.connect('item-added',
                                             Lang.bind(this, this._onCollectionAdded));
        this._collRemovedId =
            Global.contactManager.connect('item-removed',
                                             Lang.bind(this, this._onCollectionRemoved));

        // populate the model
        let job = new FetchCollectionStateForSelectionJob();
        job.run(Lang.bind(this, this._onFetchCollectionStateForSelection));
    },

    _findCollectionIter: function(item) {
        let collPath = null;

        this.model.foreach(Lang.bind(this,
            function(model, path, iter) {
                let id = model.get_value(iter, OrganizeModelColumns.ID);

                if (item.id == id) {
                    collPath = path.copy();
                    return true;
                }

                return false;
            }));

        if (collPath)
            return this.model.get_iter(collPath)[1];

        return null;
    },

    _onFetchCollectionStateForSelection: function(collectionState) {
        this.removePlaceholder();

        for (idx in collectionState) {
            let item = Global.collectionManager.getItemById(idx);

            if (collectionState[item.id])
                continue;

            let iter = this._findCollectionIter(item);

            if (!iter)
                iter = this.model.append();

            this.model.set(iter,
                [ 0, 1, 2 ],
                [ item.id, item.name, collectionState[item.id] ]);
        }
    },

    _refreshState: function() {
        let job = new FetchCollectionStateForSelectionJob();
        job.run(Lang.bind(this, this._onFetchCollectionStateForSelection));
    },

    _onCollectionAdded: function(manager, itemAdded) {
        this._refreshState();
    },

    _onCollectionRemoved: function(manager, itemRemoved) {
        let iter = this._findCollectionIter(itemRemoved);

        if (iter)
            this.model.remove(iter);
    },

    refreshCollectionState: function() {
        this._refreshState();
    },

    addPlaceholder: function() {
        this.removePlaceholder();

        let iter = this.model.append();
        this.model.set(iter,
            [ 0, 1, 2 ],
            [ _CONTACT_PLACEHOLDER_ID, '', OrganizeCollectionState.ACTIVE ]);

        let placeholderPath = this.model.get_path(iter);
        if (placeholderPath != null)
            this._placeholderRef = Gtk.TreeRowReference.new(this.model, placeholderPath);

        return placeholderPath;
    },

    removePlaceholder: function() {
        // remove the placeholder if it's here
        if (this._placeholderRef) {
            let placeholderPath = this._placeholderRef.get_path();
            let placeholderIter = this.model.get_iter(placeholderPath)[1];

            if (placeholderIter)
                this.model.remove(placeholderIter);

            this._placeholderRef = null;
        }
    },

    getPlaceholder: function(forget) {
        let ret = null;

        if (this._placeholderRef)
            ret = this._placeholderRef.get_path();
        if (forget)
            this._placeholderRef = null;

        return ret;
    },

    destroy: function() {
        if (this._collAddedId != 0) {
            Global.contactManager.disconnect(this._collAddedId);
            this._collAddedId = 0;
        }

        if (this._collRemovedId != 0) {
            Global.contactManager.disconnect(this._collRemovedId);
            this._collRemovedId = 0;
        }
    }
});

const OrganizeCollectionView = new Lang.Class({
    Name: 'OrganizeCollectionView',

    _init: function() {
        this._choiceConfirmed = false;

        this._model = new OrganizeCollectionModel();
        this.tree = new Gtk.TreeView({ headers_visible: false,
                                       vexpand: true,
                                       hexpand: true });
        this.tree.set_model(this._model.model);

        this.tree.connect('destroy', Lang.bind(this,
            function() {
                this._model.destroy();
            }));

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
        
        this._rendererText.editable = true;
        let path = this._model.addPlaceholder();
        this.tree.set_cursor_on_cell(path, this._viewCol, this._rendererText, true);
        this._rendererText.connect('edited', Lang.bind(this, this._onTextEdited));
        this._rendererText.connect('editing-canceled', Lang.bind(this, this._onTextEditCanceled));

        this.tree.show();
    },


    _onNewUserCreated: function(createdUrn) {//this should create a new user, pass in 
        if (!createdUrn) {//this._user instanceOf this._owner
            this._model.removePlaceholder();
            return;
        }

        let path = this._model.getPlaceholder(true);
        if (!path)
            return;

        let iter = this._model.model.get_iter(path)[1];
        this._model.model.set_value(iter, OrganizeModelColumns.ID, this._contributor);

        let job = new SetCollectionForSelectionJob(createdUrn, true);//send new permission to google
        job.run(null);
    },

    _onTextEditedReal: function(cell, path, newText) {
        cell.editable = false;

        if (!newText || newText == '') {
            // don't insert collections with empty names
            this._model.removePlaceholder();
            return;
        }

        // update the new name immediately
        let iter = this._model.model.get_iter(path)[1];
        this._model.model.set_value(iter, OrganizeModelColumns.NAME, newText);

        // actually create the new collection
        let job = new CreateCollectionJob(newText);
        job.run(Lang.bind(this, this._onNewUserCreated));
    },

    _onTextEdited: function(cell, pathStr, newText) {
        this._onTextEditedReal(cell, Gtk.TreePath.new_from_string(pathStr), newText);
    },

    _onTextEditCanceled: function(cell) {
        if (this._choiceConfirmed) {
            this._choiceConfirmed = false;

            let entry = this._viewCol.cell_area.get_edit_widget();
            let path = this._model.getPlaceholder(false);

            if (entry && path)
                this._onTextEditedReal(cell, path, entry.get_text());
        } else {
            this._model.removePlaceholder();
        }
    },

    _detailCellFunc: function(col, cell, model, iter) {
        let id = model.get_value(iter, OrganizeModelColumns.ID);
        let item = Global.collectionManager.getItemById(id);

            cell.text = "permission"; //replace with permission text
            cell.visible = true;
    },

    addCollection: function() {
        let path = this._model.addPlaceholder();

        if (!path)
            return;

        this._rendererText.editable = true;
        this.tree.set_cursor_on_cell(path, this._viewCol, this._rendererText, true);
    },

    confirmedChoice: function() {
        this._choiceConfirmed = true;
    }
});

const OrganizeCollectionDialogResponse = {
    ADD: 1
};


     


